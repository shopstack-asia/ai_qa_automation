/**
 * Data Orchestrator: prepares test data from test case metadata (deterministic, no AI).
 * Runs before the execution engine. Resolves RECORD_MUST_EXIST / RECORD_MUST_NOT_EXIST
 * and fills ExecutionContext.variables for placeholder replacement during execution.
 */

export type DataCondition =
  | "RECORD_MUST_EXIST"
  | "RECORD_MUST_NOT_EXIST"
  | "NO_DATA_DEPENDENCY"
  | "STATEFUL_DEPENDENCY"
  | "CROSS_ENTITY_DEPENDENCY";

export interface TestCaseInput {
  title: string;
  testType: "API" | "E2E";
  testSteps: string[];
  expectedResult?: string;
  category?: string;
  data_condition?: DataCondition | null;
  setup_hint?: string | null;
}

export interface EntityConfig {
  searchable_fields: string[];
  fixtureApi: string;
  /** Optional: GET path to check existence, e.g. "/internal/test/fixtures/customer". Default: fixtureApi + "/:id" */
  checkApi?: string;
  /** Response field for created entity ID. Default: "id" or first searchable_fields[0] */
  idField?: string;
}

export interface ApplicationConfig {
  domain?: {
    entities: Record<string, EntityConfig>;
    defaultEntity?: string;
  };
}

export interface EnvConfig {
  baseUrl: string;
  /** Optional credentials for internal fixture/check API calls */
  credentials?: {
    username?: string;
    password?: string;
    apiToken?: string;
  };
  /** E2E: when ALWAYS_AUTH, pre-execution will prepend a login step */
  e2eAuthMode?: "ALWAYS_AUTH" | "NEVER_AUTH" | "CONDITIONAL";
  /** API: when BASIC_AUTH or BEARER_TOKEN, auth is applied per request */
  apiAuthMode?: "NONE" | "BASIC_AUTH" | "BEARER_TOKEN";
}

export interface ExecutionContext {
  variables: Record<string, string>;
  preparedEntities: unknown[];
}

const MAX_NON_EXISTING_RETRIES = 5;

function randomId(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 24; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

function variableKey(entityName: string, kind: "VALID" | "NON_EXISTING"): string {
  const upper = entityName.toUpperCase().replace(/-/g, "_");
  const suffix = upper.endsWith("_ID") ? upper : `${upper}_ID`;
  return kind === "VALID" ? `VALID_${suffix}` : `NON_EXISTING_${suffix}`;
}

export class DataOrchestrator {
  private envConfig!: EnvConfig;
  private appConfig!: ApplicationConfig;

  private getEntity(name: string): EntityConfig | null {
    const entities = this.appConfig.domain?.entities;
    if (!entities || !entities[name]) return null;
    return entities[name];
  }

  private getDefaultEntity(): string | null {
    return this.appConfig.domain?.defaultEntity ?? null;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; data?: unknown }> {
    const url = path.startsWith("http") ? path : `${this.envConfig.baseUrl.replace(/\/$/, "")}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.envConfig.credentials?.apiToken) {
      headers["Authorization"] = `Bearer ${this.envConfig.credentials.apiToken}`;
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined && method === "POST") init.body = JSON.stringify(body);

    try {
      const res = await fetch(url, init);
      let data: unknown;
      const ct = res.headers.get("content-type");
      if (ct?.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = undefined;
        }
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[DataOrchestrator] request failed", { method, path, error: msg });
      throw new Error(`DataOrchestrator request failed: ${path} - ${msg}`);
    }
  }

  /**
   * Create a fixture record via internal API. Returns the resolved ID.
   */
  async createFixture(entityName: string): Promise<string> {
    const entity = this.getEntity(entityName);
    if (!entity) {
      throw new Error(`DataOrchestrator: unknown entity "${entityName}"`);
    }
    const path = entity.fixtureApi.startsWith("/") ? entity.fixtureApi : `/${entity.fixtureApi}`;
    const { ok, status, data } = await this.request("POST", path, {});

    if (!ok) {
      console.error("[DataOrchestrator] createFixture failed", {
        entityName,
        path,
        status,
        data,
      });
      throw new Error(
        `DataOrchestrator: fixture creation failed for ${entityName} (HTTP ${status})`
      );
    }

    const idField = entity.idField ?? entity.searchable_fields[0] ?? "id";
    const record = (data as Record<string, unknown>) ?? {};
    const id = record[idField] ?? record.id;
    if (id == null || typeof id !== "string") {
      console.error("[DataOrchestrator] createFixture response missing id", {
        entityName,
        data,
        idField,
      });
      throw new Error(
        `DataOrchestrator: fixture response for ${entityName} missing id field (${idField})`
      );
    }
    return id;
  }

  /**
   * Check if a record exists (GET by id). Returns true if 2xx, false if 404.
   */
  async checkExists(entityName: string, value: string): Promise<boolean> {
    const entity = this.getEntity(entityName);
    if (!entity) {
      throw new Error(`DataOrchestrator: unknown entity "${entityName}"`);
    }
    const basePath = entity.checkApi ?? entity.fixtureApi;
    const path = basePath.replace(/\/$/, "") + "/" + encodeURIComponent(value);
    const { ok, status } = await this.request("GET", path);
    if (status === 404) return false;
    if (ok) return true;
    console.error("[DataOrchestrator] checkExists unexpected status", {
      entityName,
      value,
      status,
    });
    return false;
  }

  /**
   * Ensure at least one record exists; create via fixture API if needed. Returns its ID.
   */
  async ensureRecordExists(entityName: string): Promise<string> {
    const id = await this.createFixture(entityName);
    return id;
  }

  /**
   * Generate an ID that does not exist for the entity. Retries up to MAX_NON_EXISTING_RETRIES.
   */
  async generateNonExistingId(entityName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_NON_EXISTING_RETRIES; attempt++) {
      const candidate = randomId();
      const exists = await this.checkExists(entityName, candidate);
      if (!exists) return candidate;
    }
    throw new Error(
      `DataOrchestrator: could not generate non-existing id for ${entityName} after ${MAX_NON_EXISTING_RETRIES} attempts`
    );
  }

  /**
   * Prepare execution context from test case and config. No AI; deterministic.
   */
  async prepare(
    testCase: TestCaseInput,
    applicationConfig: ApplicationConfig,
    envConfig: EnvConfig
  ): Promise<ExecutionContext> {
    this.appConfig = applicationConfig;
    this.envConfig = envConfig;

    const context: ExecutionContext = {
      variables: {},
      preparedEntities: [],
    };

    const dataCondition = testCase.data_condition ?? "NO_DATA_DEPENDENCY";

    if (dataCondition === "NO_DATA_DEPENDENCY") {
      return context;
    }

    if (dataCondition === "STATEFUL_DEPENDENCY" || dataCondition === "CROSS_ENTITY_DEPENDENCY") {
      // No placeholder resolution for these in this minimal implementation.
      return context;
    }

    const entityName = this.getDefaultEntity();
    if (!entityName) {
      console.warn("[DataOrchestrator] no defaultEntity; skipping data preparation");
      return context;
    }

    if (dataCondition === "RECORD_MUST_EXIST") {
      const id = await this.ensureRecordExists(entityName);
      context.variables[variableKey(entityName, "VALID")] = id;
      context.preparedEntities.push({ entity: entityName, id, kind: "valid" });
      return context;
    }

    if (dataCondition === "RECORD_MUST_NOT_EXIST") {
      const id = await this.generateNonExistingId(entityName);
      context.variables[variableKey(entityName, "NON_EXISTING")] = id;
      context.preparedEntities.push({ entity: entityName, id, kind: "non_existing" });
      return context;
    }

    return context;
  }
}
