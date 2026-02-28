"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Role } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Download, GripVertical, History, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { VideoPreview } from "@/components/executions/video-preview";
import { getExecutionDisplayStatus, executionStatusBadgeVariant } from "@/lib/execution-status";

interface ProjectDetail {
  id: string;
  name: string;
  jiraProjectKey: string | null;
  defaultExecutionStrategy: string;
  isActive: boolean;
  _count: { testCases: number; executions: number; environments: number };
  ticketsCount?: number;
  passedCount?: number;
  failedCount?: number;
  executionRunningCount?: number;
  testRunTotal?: number;
  testRunRunningCount?: number;
  testRunCompletedCount?: number;
}

interface ApplicationRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  enabled: boolean;
  platform: string | null;
  testTypes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface EnvironmentRow {
  id: string;
  name: string;
  baseUrl: string;
  platform: string | null;
  applicationId: string | null;
  application?: { id: string; name: string; code: string; platform: string | null; testTypes: unknown } | null;
  type: string;
  isActive: boolean;
  apiAuthMode: string;
  e2eAuthMode: string;
}

const TC_CATEGORY_OPTIONS = ["FUNCTIONAL", "NEGATIVE", "VALIDATION", "SECURITY", "ROLE_BASED", "DATA_MASKING", "ACCESS_CONTROL", "ERROR_HANDLING", "EDGE_CASE", "COMPLIANCE"] as const;
const TC_DATA_CONDITION_OPTIONS = ["RECORD_MUST_EXIST", "RECORD_MUST_NOT_EXIST", "NO_DATA_DEPENDENCY", "STATEFUL_DEPENDENCY", "CROSS_ENTITY_DEPENDENCY"] as const;

function formatShortNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

interface TestCaseRow {
  id: string;
  title: string;
  priority: string;
  status: string;
  source: string;
  testType: string | null;
  platform: string | null;
  applicationId: string | null;
  application?: { id: string; name: string; code: string; platform: string | null; testTypes: unknown } | null;
  testSteps: string[];
  expectedResult: string | null;
  category: string | null;
  data_condition: string | null;
  setup_hint: string | null;
  ignoreReason: string | null;
  ticketId: string | null;
  updatedAt: string;
}

interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  status: string;
  externalId: string | null;
  priority: string | null;
  applicationIds: string[] | null;
  createdAt: string;
  updatedAt: string;
  _count?: { testCases: number };
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [appPage, setAppPage] = useState(1);
  const [appLimit, setAppLimit] = useState(10);
  const [appTotalPages, setAppTotalPages] = useState(1);
  const [appSearch, setAppSearch] = useState("");
  const [appSearchInput, setAppSearchInput] = useState("");
  const [appPlatform, setAppPlatform] = useState("");
  const [appEnabled, setAppEnabled] = useState("");
  const [appSortBy, setAppSortBy] = useState<"name" | "code" | "platform" | "enabled" | "createdAt">("name");
  const [appSortOrder, setAppSortOrder] = useState<"asc" | "desc">("asc");
  const [appLoading, setAppLoading] = useState(false);
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [appForm, setAppForm] = useState({
    name: "",
    code: "",
    description: "",
    enabled: true,
    platform: "",
    testTypes: [] as string[],
  });
  const [appSubmitting, setAppSubmitting] = useState(false);
  const [appError, setAppError] = useState("");
  const [viewApplication, setViewApplication] = useState<ApplicationRow | null>(null);
  const [viewAppForm, setViewAppForm] = useState<{
    name: string;
    code: string;
    description: string;
    enabled: boolean;
    platform: string;
    testTypes: string[];
  } | null>(null);
  const [viewAppSaving, setViewAppSaving] = useState(false);
  const [viewAppError, setViewAppError] = useState("");
  const [appConfirmDeleteId, setAppConfirmDeleteId] = useState<string | null>(null);
  const [appDeleting, setAppDeleting] = useState(false);
  const [appDeleteError, setAppDeleteError] = useState("");
  const [platformListWithTypes, setPlatformListWithTypes] = useState<{ name: string; testTypes: string[] }[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentRow[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRow[]>([]);
  const [tcTotal, setTcTotal] = useState(0);
  const [tcPage, setTcPage] = useState(1);
  const [tcLimit, setTcLimit] = useState(10);
  const [tcTotalPages, setTcTotalPages] = useState(1);
  const [tcSearch, setTcSearch] = useState("");
  const [tcSearchInput, setTcSearchInput] = useState("");
  const [tcPriority, setTcPriority] = useState("");
  const [tcStatus, setTcStatus] = useState("");
  const [tcTestType, setTcTestType] = useState("");
  const [tcPlatform, setTcPlatform] = useState("");
  const [tcSortBy, setTcSortBy] = useState<"title" | "priority" | "status" | "updatedAt">("updatedAt");
  const [tcSortOrder, setTcSortOrder] = useState<"asc" | "desc">("desc");
  const [tcLoading, setTcLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editJiraKey, setEditJiraKey] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState("");

  type EnvCredential = { role: string; username: string; password: string };
  const defaultEnvCredentials: EnvCredential[] = [{ role: "", username: "", password: "" }];
  const [envDrawerOpen, setEnvDrawerOpen] = useState(false);
  const [envForm, setEnvForm] = useState({
    name: "",
    baseUrl: "",
    applicationId: "",
    type: "E2E" as "API" | "E2E",
    appKey: "",
    secretKey: "",
    apiToken: "",
    credentials: defaultEnvCredentials,
    apiAuthMode: "NONE" as "NONE" | "BASIC_AUTH" | "BEARER_TOKEN",
    e2eAuthMode: "NEVER_AUTH" as "ALWAYS_AUTH" | "NEVER_AUTH" | "CONDITIONAL",
  });
  const [envSubmitting, setEnvSubmitting] = useState(false);
  const [envError, setEnvError] = useState("");
  const [envSearch, setEnvSearch] = useState("");
  const [envSearchInput, setEnvSearchInput] = useState("");
  const [envPage, setEnvPage] = useState(1);
  const [envLimit, setEnvLimit] = useState(10);
  const [envTotal, setEnvTotal] = useState(0);
  const [envTotalPages, setEnvTotalPages] = useState(1);
  const [envSortBy, setEnvSortBy] = useState<"name" | "baseUrl" | "type" | "isActive" | "createdAt">("name");
  const [envSortOrder, setEnvSortOrder] = useState<"asc" | "desc">("asc");
  const [envType, setEnvType] = useState("");
  const [envStatus, setEnvStatus] = useState("");
  const [envLoading, setEnvLoading] = useState(false);
  const [viewEnvironment, setViewEnvironment] = useState<EnvironmentRow | null>(null);
  const [viewEnvForm, setViewEnvForm] = useState<{
    name: string;
    baseUrl: string;
    applicationId: string;
    type: "API" | "E2E";
    isActive: boolean;
    appKey: string;
    secretKey: string;
    apiToken: string;
    credentials: EnvCredential[];
    apiAuthMode: string;
    e2eAuthMode: string;
  } | null>(null);
  const [envApplicationOptions, setEnvApplicationOptions] = useState<ApplicationRow[]>([]);
  const [viewEnvSaving, setViewEnvSaving] = useState(false);
  const [viewEnvError, setViewEnvError] = useState("");
  const [envConfirmDeleteId, setEnvConfirmDeleteId] = useState<string | null>(null);
  const [envDeleting, setEnvDeleting] = useState(false);
  const [envDeleteError, setEnvDeleteError] = useState("");

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketTotal, setTicketTotal] = useState(0);
  const [ticketPage, setTicketPage] = useState(1);
  const [ticketLimit, setTicketLimit] = useState(10);
  const [ticketTotalPages, setTicketTotalPages] = useState(1);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketSearchInput, setTicketSearchInput] = useState("");
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPriority, setTicketPriority] = useState("");
  const [ticketSortBy, setTicketSortBy] = useState("updatedAt");
  const [ticketSortOrder, setTicketSortOrder] = useState<"asc" | "desc">("desc");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketDrawerOpen, setTicketDrawerOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    title: "",
    description: "",
    acceptanceCriteria: "",
    externalId: "",
    priority: "",
    applicationIds: [] as string[],
  });
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState("");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [viewTicket, setViewTicket] = useState<TicketRow | null>(null);
  const [ticketActionDropdownId, setTicketActionDropdownId] = useState<string | null>(null);
  const ticketActionDropdownRef = useRef<HTMLDivElement>(null);
  const [ticketConfirmAction, setTicketConfirmAction] = useState<{ ticketId: string; status: "READY_TO_TEST" | "DONE" | "CANCEL" } | null>(null);
  const [viewTicketEditForm, setViewTicketEditForm] = useState<{
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: string;
    externalId: string;
    applicationIds: string[];
  } | null>(null);
  const [viewTicketSaving, setViewTicketSaving] = useState(false);
  const [ticketApplicationOptions, setTicketApplicationOptions] = useState<ApplicationRow[]>([]);
  const [projectDetailTab, setProjectDetailTab] = useState<"applications" | "environments" | "tickets" | "test-cases" | "test-runs" | "data-knowledge" | "selector-knowledge">("applications");
  const [exportTcLoading, setExportTcLoading] = useState(false);

  const [tcDrawerOpen, setTcDrawerOpen] = useState(false);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [tcForm, setTcForm] = useState({
    title: "",
    ticketId: "",
    applicationId: "",
    priority: "MEDIUM" as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    testType: "E2E" as "API" | "E2E",
    testSteps: [] as string[],
    expectedResult: "",
    category: "",
    data_condition: "",
    setup_hint: "",
  });
  const [tcSubmitting, setTcSubmitting] = useState(false);
  const [tcError, setTcError] = useState("");
  const [tcDragStepIndex, setTcDragStepIndex] = useState<number | null>(null);
  const [viewTestCase, setViewTestCase] = useState<TestCaseRow | null>(null);
  const [viewTcForm, setViewTcForm] = useState<{
    title: string;
    ticketId: string;
    applicationId: string;
    priority: string;
    testType: string;
    testSteps: string[];
    expectedResult: string;
    category: string;
    data_condition: string;
    setup_hint: string;
  } | null>(null);
  const [viewTcSaving, setViewTcSaving] = useState(false);
  const [viewTcError, setViewTcError] = useState("");
  const [tcConfirmAction, setTcConfirmAction] = useState<{ tcId: string; status: "READY" | "CANCEL" } | null>(null);
  const [tcActionDropdownId, setTcActionDropdownId] = useState<string | null>(null);
  const tcActionDropdownRef = useRef<HTMLDivElement>(null);
  const [viewTcDragStepIndex, setViewTcDragStepIndex] = useState<number | null>(null);
  const [viewTcLinkedTicket, setViewTcLinkedTicket] = useState<TicketRow | null>(null);

  const [tcHistoryTestCase, setTcHistoryTestCase] = useState<TestCaseRow | null>(null);
  const [tcHistoryExecutionIds, setTcHistoryExecutionIds] = useState<string[]>([]);
  const [tcHistoryIndex, setTcHistoryIndex] = useState(0);
  const [tcHistoryExecution, setTcHistoryExecution] = useState<{
    id: string;
    status: string;
    duration: number | null;
    videoUrl: string | null;
    screenshotUrls: string[] | null;
    stepLog: Array<{ order: number; action: string; passed: boolean; error?: string; failure_type?: string | null; error_message?: string | null; screenshotUrl?: string }> | null;
    resultSummary: string | null;
    errorMessage: string | null;
    executionMetadata?: { base_url?: string; test_data?: Record<string, string | undefined>; execution_status?: string } | null;
    readableSteps?: string[] | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    testCase: { id: string; title: string };
    environment: { name: string };
  } | null>(null);
  const [tcHistoryLoading, setTcHistoryLoading] = useState(false);

  const [testRuns, setTestRuns] = useState<{ id: string; status: string; startedAt: string; completedAt: string | null; totalExecutions: number; passed: number; failed: number }[]>([]);
  const [testRunsLoading, setTestRunsLoading] = useState(false);
  const [trPage, setTrPage] = useState(1);
  const [trLimit, setTrLimit] = useState(10);
  const [trTotal, setTrTotal] = useState(0);
  const [trTotalPages, setTrTotalPages] = useState(1);
  const [trStatus, setTrStatus] = useState("");
  const [trSortBy, setTrSortBy] = useState<"startedAt" | "completedAt" | "status">("startedAt");
  const [trSortOrder, setTrSortOrder] = useState<"asc" | "desc">("desc");
  const [viewTestRunId, setViewTestRunId] = useState<string | null>(null);
  const [viewTestRunDetail, setViewTestRunDetail] = useState<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    executions: { id: string; status: string; execution_status?: string; createdAt?: string; startedAt: string | null; finishedAt: string | null; duration: number | null; testCaseId: string; testCaseTitle: string }[];
  } | null>(null);
  const [runDetailPage, setRunDetailPage] = useState(1);
  const runDetailLimit = 10;

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) {
          setUserRole(data.role as Role);
        }
      })
      .catch(() => {
        // Ignore errors
      });
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/config/platforms").then((r) => (r.ok ? r.json() : { platforms: [] })),
    ])
      .then(([proj, plat]) => {
        setProject(proj);
        setPlatformOptions(
          Array.isArray(plat?.platforms)
            ? plat.platforms.map((p: string | { name: string }) => (typeof p === "string" ? p : p.name))
            : []
        );
        setPlatformListWithTypes(
          Array.isArray(plat?.platforms)
            ? plat.platforms.map((p: string | { name: string; testTypes?: string[] }) =>
                typeof p === "string"
                  ? { name: p, testTypes: ["API", "E2E"] }
                  : { name: p.name ?? "", testTypes: Array.isArray(p.testTypes) ? p.testTypes : ["API", "E2E"] }
              ).filter((x: { name: string; testTypes: string[] }) => x.name.trim())
            : []
        );
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  const loadEnvironments = () => {
    if (!id) return;
    setEnvLoading(true);
    const params = new URLSearchParams({
      projectId: id,
      page: String(envPage),
      limit: String(envLimit),
      sortBy: envSortBy,
      sortOrder: envSortOrder,
    });
    if (envSearch) params.set("search", envSearch);
    if (envType) params.set("type", envType);
    if (envStatus === "true") params.set("isActive", "true");
    if (envStatus === "false") params.set("isActive", "false");
    fetch(`/api/environments?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: envLimit, totalPages: 1 }))
      .then((res) => {
        setEnvironments(Array.isArray(res.data) ? res.data : []);
        setEnvTotal(res.total ?? 0);
        setEnvTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setEnvironments([]))
      .finally(() => setEnvLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadEnvironments();
  }, [id, envPage, envLimit, envSearch, envType, envStatus, envSortBy, envSortOrder]);

  const loadEnvApplicationOptions = () => {
    if (!id) return;
    fetch(`/api/applications?projectId=${id}&limit=100`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res) => setEnvApplicationOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setEnvApplicationOptions([]));
  };

  useEffect(() => {
    if (!id || projectDetailTab !== "environments") return;
    loadEnvApplicationOptions();
  }, [id, projectDetailTab]);

  const loadTicketApplicationOptions = () => {
    if (!id) return;
    fetch(`/api/applications?projectId=${id}&limit=100`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((res) => setTicketApplicationOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTicketApplicationOptions([]));
  };

  useEffect(() => {
    if (!id || (projectDetailTab !== "tickets" && projectDetailTab !== "test-cases" && projectDetailTab !== "selector-knowledge")) return;
    loadTicketApplicationOptions();
  }, [id, projectDetailTab]);

  const loadApplications = () => {
    if (!id) return;
    setAppLoading(true);
    const params = new URLSearchParams({
      projectId: id,
      page: String(appPage),
      limit: String(appLimit),
      sortBy: appSortBy,
      sortOrder: appSortOrder,
    });
    if (appSearch) params.set("search", appSearch);
    if (appPlatform) params.set("platform", appPlatform);
    if (appEnabled === "true") params.set("enabled", "true");
    if (appEnabled === "false") params.set("enabled", "false");
    fetch(`/api/applications?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: appLimit, totalPages: 1 }))
      .then((res) => {
        setApplications(Array.isArray(res.data) ? res.data : []);
        setAppTotal(res.total ?? 0);
        setAppTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setApplications([]))
      .finally(() => setAppLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadApplications();
  }, [id, appPage, appLimit, appSearch, appPlatform, appEnabled, appSortBy, appSortOrder]);

  const loadTestCases = () => {
    if (!id) return;
    setTcLoading(true);
    const params = new URLSearchParams({
      projectId: id,
      page: String(tcPage),
      limit: String(tcLimit),
      sortBy: tcSortBy,
      sortOrder: tcSortOrder,
    });
    if (tcSearch) params.set("search", tcSearch);
    if (tcPriority) params.set("priority", tcPriority);
    if (tcStatus) params.set("status", tcStatus);
    if (tcTestType) params.set("testType", tcTestType);
    if (tcPlatform) params.set("platform", tcPlatform);
    fetch(`/api/test-cases?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: tcLimit, totalPages: 1 }))
      .then((res) => {
        setTestCases(Array.isArray(res.data) ? res.data : []);
        setTcTotal(res.total ?? 0);
        setTcTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setTestCases([]))
      .finally(() => setTcLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadTestCases();
  }, [id, tcPage, tcLimit, tcSearch, tcPriority, tcStatus, tcTestType, tcPlatform, tcSortBy, tcSortOrder]);

  const loadTestRuns = () => {
    if (!id) return;
    setTestRunsLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(trPage));
    params.set("limit", String(trLimit));
    if (trStatus) params.set("status", trStatus);
    params.set("sortBy", trSortBy);
    params.set("sortOrder", trSortOrder);
    fetch(`/api/projects/${id}/test-runs?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: trLimit, totalPages: 1 }))
      .then((res) => {
        setTestRuns(Array.isArray(res.data) ? res.data : []);
        setTrTotal(res.total ?? 0);
        setTrTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setTestRuns([]))
      .finally(() => setTestRunsLoading(false));
  };

  useEffect(() => {
    if (id && projectDetailTab === "test-runs") loadTestRuns();
  }, [id, projectDetailTab, trPage, trLimit, trStatus, trSortBy, trSortOrder]);

  const handleTrSort = (column: "startedAt" | "completedAt" | "status") => {
    setTrSortBy(column);
    setTrSortOrder((cur) => (trSortBy === column && cur === "desc" ? "asc" : "desc"));
    setTrPage(1);
  };

  const [dataKnowledge, setDataKnowledge] = useState<{
    id: string;
    key: string;
    type: string;
    scenario: string;
    role: string | null;
    value: unknown;
    source: string | null;
    verified: boolean | null;
    previouslyPassed: boolean | null;
    updatedAt: string;
  }[]>([]);
  const [dataKnowledgeLoading, setDataKnowledgeLoading] = useState(false);
  const [dkPage, setDkPage] = useState(1);
  const [dkLimit, setDkLimit] = useState(10);
  const [dkTotal, setDkTotal] = useState(0);
  const [dkTotalPages, setDkTotalPages] = useState(1);
  const [dkSearch, setDkSearch] = useState("");
  const [dkSearchInput, setDkSearchInput] = useState("");
  const [dkSortBy, setDkSortBy] = useState<"key" | "type" | "scenario" | "role" | "updatedAt">("updatedAt");
  const [dkSortOrder, setDkSortOrder] = useState<"asc" | "desc">("desc");
  const [dkDrawerOpen, setDkDrawerOpen] = useState(false);
  const [dkEditingId, setDkEditingId] = useState<string | null>(null);
  const [dkForm, setDkForm] = useState({
    key: "",
    type: "",
    scenario: "",
    role: "",
    value: "{}",
    source: "FIXED" as "AI_SIMULATION" | "FIXED" | "USER_INPUT",
    verified: true,
    previously_passed: false,
  });
  const [dkFormError, setDkFormError] = useState("");
  const [dkSubmitting, setDkSubmitting] = useState(false);
  const [dkConfirmDeleteId, setDkConfirmDeleteId] = useState<string | null>(null);
  const [dkDeleting, setDkDeleting] = useState(false);

  const [selectorKnowledge, setSelectorKnowledge] = useState<{
    id: string;
    applicationId: string;
    applicationName: string | null;
    applicationCode: string | null;
    semanticKey: string;
    selector: string;
    confidenceScore: number;
    usageCount: number;
    lastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[]>([]);
  const [selectorKnowledgeLoading, setSelectorKnowledgeLoading] = useState(false);
  const [skPage, setSkPage] = useState(1);
  const [skLimit, setSkLimit] = useState(10);
  const [skTotal, setSkTotal] = useState(0);
  const [skTotalPages, setSkTotalPages] = useState(1);
  const [skSearch, setSkSearch] = useState("");
  const [skSearchInput, setSkSearchInput] = useState("");
  const [skApplicationId, setSkApplicationId] = useState("");
  const [skSortBy, setSkSortBy] = useState<"application" | "semanticKey" | "selector" | "usageCount" | "lastVerifiedAt">("lastVerifiedAt");
  const [skSortOrder, setSkSortOrder] = useState<"asc" | "desc">("desc");
  const loadSelectorKnowledge = () => {
    if (!id) return;
    setSelectorKnowledgeLoading(true);
    const params = new URLSearchParams({
      page: String(skPage),
      limit: String(skLimit),
      sortBy: skSortBy,
      sortOrder: skSortOrder,
    });
    if (skSearch) params.set("search", skSearch);
    if (skApplicationId) params.set("applicationId", skApplicationId);
    fetch(`/api/projects/${id}/selector-knowledge?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: skLimit, totalPages: 1 }))
      .then((res) => {
        setSelectorKnowledge(Array.isArray(res.data) ? res.data : []);
        setSkTotal(res.total ?? 0);
        setSkTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setSelectorKnowledge([]))
      .finally(() => setSelectorKnowledgeLoading(false));
  };
  useEffect(() => {
    if (id && projectDetailTab === "selector-knowledge") loadSelectorKnowledge();
  }, [id, projectDetailTab, skPage, skLimit, skSearch, skApplicationId, skSortBy, skSortOrder]);
  const applySkSearch = () => {
    setSkSearch(skSearchInput.trim());
    setSkPage(1);
  };
  const goToSkPage = (page: number) => {
    if (page < 1 || page > skTotalPages) return;
    setSkPage(page);
  };
  const handleSkSort = (column: "application" | "semanticKey" | "selector" | "usageCount" | "lastVerifiedAt") => {
    if (skSortBy === column) {
      setSkSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSkSortBy(column);
      setSkSortOrder(column === "lastVerifiedAt" ? "desc" : "asc");
    }
    setSkPage(1);
  };

  const loadDataKnowledge = () => {
    if (!id) return;
    setDataKnowledgeLoading(true);
    const params = new URLSearchParams({ page: String(dkPage), limit: String(dkLimit), sortBy: dkSortBy, sortOrder: dkSortOrder });
    if (dkSearch) params.set("search", dkSearch);
    fetch(`/api/projects/${id}/data-knowledge?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: dkLimit, totalPages: 1 }))
      .then((res) => {
        setDataKnowledge(Array.isArray(res.data) ? res.data : []);
        setDkTotal(res.total ?? 0);
        setDkTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setDataKnowledge([]))
      .finally(() => setDataKnowledgeLoading(false));
  };
  useEffect(() => {
    if (id && projectDetailTab === "data-knowledge") loadDataKnowledge();
  }, [id, projectDetailTab, dkPage, dkLimit, dkSearch, dkSortBy, dkSortOrder]);
  const applyDkSearch = () => {
    setDkSearch(dkSearchInput.trim());
    setDkPage(1);
  };
  const goToDkPage = (page: number) => {
    if (page < 1 || page > dkTotalPages) return;
    setDkPage(page);
  };
  const handleDkSort = (column: "key" | "type" | "scenario" | "role" | "updatedAt") => {
    if (dkSortBy === column) setDkSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setDkSortBy(column);
      setDkSortOrder(column === "updatedAt" ? "desc" : "asc");
    }
    setDkPage(1);
  };
  const openDkModal = (row?: (typeof dataKnowledge)[0] | null) => {
    if (row) {
      setDkEditingId(row.id);
      setDkForm({
        key: row.key,
        type: row.type,
        scenario: row.scenario,
        role: row.role ?? "",
        value: typeof row.value === "object" ? JSON.stringify(row.value, null, 2) : String(row.value ?? "{}"),
        source: (row.source === "AI_SIMULATION" || row.source === "USER_INPUT" ? row.source : "FIXED") as "AI_SIMULATION" | "FIXED" | "USER_INPUT",
        verified: row.verified ?? false,
        previously_passed: row.previouslyPassed ?? false,
      });
    } else {
      setDkEditingId(null);
      setDkForm({ key: "", type: "", scenario: "", role: "", value: "{}", source: "FIXED", verified: true, previously_passed: false });
    }
    setDkFormError("");
    setDkDrawerOpen(true);
  };
  const closeDkModal = () => {
    setDkDrawerOpen(false);
    setDkEditingId(null);
    setDkForm({ key: "", type: "", scenario: "", role: "", value: "{}", source: "FIXED", verified: true, previously_passed: false });
    setDkFormError("");
  };
  const submitDkForm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setDkFormError("");
    if (!id) return;
    const key = dkForm.key.trim();
    const type = dkForm.type.trim().toUpperCase();
    const scenario = dkForm.scenario.trim().toUpperCase();
    const role = dkForm.role.trim() ? dkForm.role.trim().toUpperCase() : null;
    const valueStr = dkForm.value.trim();
    if (!key) {
      setDkFormError("Key is required");
      return;
    }
    if (!type) {
      setDkFormError("Type is required");
      return;
    }
    if (!scenario) {
      setDkFormError("Scenario is required");
      return;
    }
    let valueObj: object;
    try {
      valueObj = JSON.parse(valueStr || "{}");
    } catch {
      setDkFormError("Value must be valid JSON");
      return;
    }
    setDkSubmitting(true);
    try {
      if (dkEditingId) {
        const res = await fetch(`/api/projects/${id}/data-knowledge/${dkEditingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, type, scenario, role, value: valueObj, verified: dkForm.verified, previously_passed: dkForm.previously_passed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data.error;
          const msg = err?.formErrors?.[0] ?? (Array.isArray(err?.formErrors) ? err.formErrors.join(", ") : null) ?? err?.message ?? JSON.stringify(err) ?? "Update failed";
          setDkFormError(typeof msg === "string" ? msg : "Update failed");
          return;
        }
        toast.success("Data knowledge updated");
      } else {
        const res = await fetch(`/api/projects/${id}/data-knowledge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, type, scenario, role, value: valueObj, verified: dkForm.verified, previously_passed: dkForm.previously_passed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = data.error;
          const msg = err?.formErrors?.[0] ?? (Array.isArray(err?.formErrors) ? err.formErrors.join(", ") : null) ?? err?.message ?? JSON.stringify(err) ?? "Create failed";
          setDkFormError(typeof msg === "string" ? msg : "Create failed");
          return;
        }
        toast.success("Data knowledge created");
      }
      closeDkModal();
      loadDataKnowledge();
    } catch {
      setDkFormError("Request failed");
    } finally {
      setDkSubmitting(false);
    }
  };
  const deleteDataKnowledge = async (dkId: string) => {
    if (!id) return;
    setDkDeleting(true);
    try {
      const res = await fetch(`/api/projects/${id}/data-knowledge/${dkId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Delete failed");
        return;
      }
      toast.success("Deleted");
      setDkConfirmDeleteId(null);
      loadDataKnowledge();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDkDeleting(false);
    }
  };

  useEffect(() => {
    if (!id || !viewTestRunId) {
      setViewTestRunDetail(null);
      return;
    }
    fetch(`/api/projects/${id}/test-runs/${viewTestRunId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setViewTestRunDetail)
      .catch(() => setViewTestRunDetail(null));
  }, [id, viewTestRunId]);

  const loadTickets = () => {
    if (!id) return;
    setTicketLoading(true);
    const params = new URLSearchParams({
      projectId: id,
      page: String(ticketPage),
      limit: String(ticketLimit),
      sortBy: ticketSortBy,
      sortOrder: ticketSortOrder,
    });
    if (ticketSearch) params.set("search", ticketSearch);
    if (ticketStatus) params.set("status", ticketStatus);
    if (ticketPriority) params.set("priority", ticketPriority);
    fetch(`/api/tickets?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], total: 0, page: 1, limit: ticketLimit, totalPages: 1 }))
      .then((res) => {
        setTickets(Array.isArray(res.data) ? res.data : []);
        setTicketTotal(res.total ?? 0);
        setTicketTotalPages(res.totalPages ?? 1);
      })
      .catch(() => setTickets([]))
      .finally(() => setTicketLoading(false));
  };

  useEffect(() => {
    if (!id) return;
    loadTickets();
  }, [id, ticketPage, ticketLimit, ticketSearch, ticketStatus, ticketPriority, ticketSortBy, ticketSortOrder]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ticketActionDropdownRef.current && !ticketActionDropdownRef.current.contains(e.target as Node)) {
        setTicketActionDropdownId(null);
      }
    };
    if (ticketActionDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [ticketActionDropdownId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tcActionDropdownRef.current && !tcActionDropdownRef.current.contains(e.target as Node)) {
        setTcActionDropdownId(null);
      }
    };
    if (tcActionDropdownId) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [tcActionDropdownId]);

  useEffect(() => {
    if (viewTicket?.status === "DRAFT") {
      setViewTicketEditForm({
        title: viewTicket.title,
        description: viewTicket.description ?? "",
        acceptanceCriteria: viewTicket.acceptanceCriteria ?? "",
        priority: viewTicket.priority ?? "",
        externalId: viewTicket.externalId ?? "",
        applicationIds: Array.isArray(viewTicket.applicationIds) ? [...viewTicket.applicationIds] : [],
      });
    } else {
      setViewTicketEditForm(null);
    }
  }, [viewTicket]);

  const applyTicketSearch = () => {
    setTicketSearch(ticketSearchInput.trim());
    setTicketPage(1);
  };

  const applyEnvSearch = () => {
    setEnvSearch(envSearchInput.trim());
    setEnvPage(1);
  };

  const goToEnvPage = (page: number) => {
    if (page < 1 || page > envTotalPages) return;
    setEnvPage(page);
  };

  const handleEnvSort = (column: "name" | "baseUrl" | "type" | "isActive" | "createdAt") => {
    if (envSortBy === column) {
      setEnvSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setEnvSortBy(column);
      setEnvSortOrder("asc");
    }
    setEnvPage(1);
  };

  const goToTicketPage = (page: number) => {
    if (page < 1 || page > ticketTotalPages) return;
    setTicketPage(page);
  };

  const handleTicketSort = (column: "title" | "status" | "priority" | "updatedAt") => {
    if (ticketSortBy === column) {
      setTicketSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setTicketSortBy(column);
      setTicketSortOrder(column === "updatedAt" ? "desc" : "asc");
    }
    setTicketPage(1);
  };

  const applyTcSearch = () => {
    setTcSearch(tcSearchInput.trim());
    setTcPage(1);
  };

  const goToTcPage = (page: number) => {
    if (page < 1 || page > tcTotalPages) return;
    setTcPage(page);
  };

  const goToTrPage = (page: number) => {
    if (page < 1 || page > trTotalPages) return;
    setTrPage(page);
  };

  const handleTcSort = (column: "title" | "priority" | "status" | "updatedAt") => {
    if (tcSortBy === column) {
      setTcSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setTcSortBy(column);
      setTcSortOrder(column === "updatedAt" ? "desc" : "asc");
    }
    setTcPage(1);
  };

  const openDrawer = () => {
    if (project) {
      setEditName(project.name);
      setEditJiraKey(project.jiraProjectKey ?? "");
      setSaveError("");
      setDrawerOpen(true);
    }
  };

  const saveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSaveError("");
    setSaveLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          jiraProjectKey: editJiraKey.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error?.message ?? (typeof data.error === "object" ? "Update failed" : data.error) ?? "Update failed");
        return;
      }
      setProject({ ...project, name: data.name, jiraProjectKey: data.jiraProjectKey });
      setDrawerOpen(false);
    } catch {
      setSaveError("Network error");
    } finally {
      setSaveLoading(false);
    }
  };

  const openEnvDrawer = () => {
    setEnvDrawerOpen(true);
    setEnvError("");
    setEnvForm({
      name: "",
      baseUrl: "",
      applicationId: "",
      type: "E2E",
      appKey: "",
      secretKey: "",
      apiToken: "",
      credentials: [...defaultEnvCredentials],
      apiAuthMode: "NONE",
      e2eAuthMode: "NEVER_AUTH",
    });
  };

  const createEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvError("");
    if (!envForm.name.trim() || !envForm.baseUrl.trim()) {
      setEnvError("Name and Base URL are required");
      return;
    }
    const apiBasicAuth = envForm.type === "API" && envForm.apiAuthMode === "BASIC_AUTH";
    const apiBearerAuth = envForm.type === "API" && envForm.apiAuthMode === "BEARER_TOKEN";
    const e2eNeedsAuth = envForm.type === "E2E" && (envForm.e2eAuthMode === "ALWAYS_AUTH" || envForm.e2eAuthMode === "CONDITIONAL");
    if (apiBasicAuth) {
      if (!envForm.appKey.trim() || !envForm.secretKey.trim()) {
        setEnvError("App Key and Secret Key are required for Basic Auth");
        return;
      }
    }
    if (apiBearerAuth) {
      if (!envForm.apiToken.trim()) {
        setEnvError("Token is required for Bearer Token auth");
        return;
      }
    }
    if (e2eNeedsAuth) {
      const valid = envForm.credentials.filter((c) => c.username.trim());
      if (valid.length === 0) {
        setEnvError("Enter at least one username/password when E2E auth is required");
        return;
      }
    }
    setEnvSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        projectId: id,
        name: envForm.name.trim(),
        baseUrl: envForm.baseUrl.trim(),
        type: envForm.type,
        applicationId: envForm.applicationId.trim() || undefined,
        apiAuthMode: envForm.apiAuthMode,
        e2eAuthMode: envForm.e2eAuthMode,
      };
      if (apiBasicAuth) {
        body.appKey = envForm.appKey.trim();
        body.secretKey = envForm.secretKey.trim();
      }
      if (apiBearerAuth) {
        body.apiToken = envForm.apiToken.trim();
      }
      if (e2eNeedsAuth) {
        body.credentials = envForm.credentials
          .filter((c) => c.username.trim())
          .map((c) => ({ role: c.role.trim() || undefined, username: c.username.trim(), password: c.password }));
      }
      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEnvError(data.error?.message ?? (typeof data.error === "object" ? "Invalid input" : data.error) ?? "Failed to create");
        return;
      }
      setEnvDrawerOpen(false);
      loadEnvironments();
    } catch {
      setEnvError("Network error");
    } finally {
      setEnvSubmitting(false);
    }
  };

  const applyAppSearch = () => {
    setAppSearch(appSearchInput.trim());
    setAppPage(1);
  };
  const goToAppPage = (page: number) => {
    if (page < 1 || page > appTotalPages) return;
    setAppPage(page);
  };
  const handleAppSort = (column: "name" | "code" | "platform" | "enabled" | "createdAt") => {
    if (appSortBy === column) {
      setAppSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setAppSortBy(column);
      setAppSortOrder(column === "createdAt" ? "desc" : "asc");
    }
    setAppPage(1);
  };
  const openAppDrawer = () => {
    setAppDrawerOpen(true);
    setAppError("");
    setAppForm({
      name: "",
      code: "",
      description: "",
      enabled: true,
      platform: "",
      testTypes: [],
    });
  };
  const createApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    setAppError("");
    if (!appForm.name.trim() || !appForm.code.trim()) {
      setAppError("Name and Code are required");
      return;
    }
    setAppSubmitting(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          name: appForm.name.trim(),
          code: appForm.code.trim(),
          description: appForm.description.trim() || undefined,
          enabled: appForm.enabled,
          platform: appForm.platform.trim() || undefined,
          testTypes: appForm.testTypes.length > 0 ? appForm.testTypes : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppError(data.error?.message ?? (typeof data.error === "object" ? "Invalid input" : data.error) ?? "Failed to create");
        return;
      }
      setAppDrawerOpen(false);
      loadApplications();
    } catch {
      setAppError("Network error");
    } finally {
      setAppSubmitting(false);
    }
  };
  const openViewApp = (app: ApplicationRow) => {
    setViewApplication(app);
    setViewAppError("");
    setViewAppForm({
      name: app.name,
      code: app.code,
      description: app.description ?? "",
      enabled: !!app.enabled,
      platform: app.platform ?? "",
      testTypes: Array.isArray(app.testTypes) ? [...app.testTypes] : [],
    });
  };
  const saveViewApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewApplication || !viewAppForm) return;
    setViewAppError("");
    if (!viewAppForm.name.trim() || !viewAppForm.code.trim()) {
      setViewAppError("Name and Code are required");
      return;
    }
    setViewAppSaving(true);
    try {
      const res = await fetch(`/api/applications/${viewApplication.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: viewAppForm.name.trim(),
          code: viewAppForm.code.trim(),
          description: viewAppForm.description.trim() || undefined,
          enabled: viewAppForm.enabled,
          platform: viewAppForm.platform.trim() || undefined,
          testTypes: viewAppForm.testTypes.length > 0 ? viewAppForm.testTypes : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setViewAppError(data.error?.message ?? (typeof data.error === "object" ? "Update failed" : data.error) ?? "Update failed");
        return;
      }
      setViewApplication(null);
      setViewAppForm(null);
      loadApplications();
    } catch {
      setViewAppError("Network error");
    } finally {
      setViewAppSaving(false);
    }
  };
  const deleteApplication = async (appId: string) => {
    setAppDeleting(true);
    setAppDeleteError("");
    try {
      const res = await fetch(`/api/applications/${appId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setAppDeleteError(data.error ?? "Failed to delete");
        return;
      }
      if (viewApplication?.id === appId) {
        setViewApplication(null);
        setViewAppForm(null);
      }
      setAppConfirmDeleteId(null);
      loadApplications();
    } catch {
      setAppDeleteError("Network error");
    } finally {
      setAppDeleting(false);
    }
  };

  const deleteEnvironment = async (envId: string) => {
    setEnvDeleteError("");
    setEnvDeleting(true);
    try {
      const res = await fetch(`/api/environments/${envId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setEnvDeleteError(data.error ?? "Cannot delete environment");
        return;
      }
      setEnvConfirmDeleteId(null);
      setEnvDeleteError("");
      loadEnvironments();
    } catch {
      setEnvDeleteError("Network error");
    } finally {
      setEnvDeleting(false);
    }
  };

  const saveViewEnvironment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewEnvironment || !viewEnvForm) return;
    setViewEnvError("");
    if (!viewEnvForm.name.trim() || !viewEnvForm.baseUrl.trim()) {
      setViewEnvError("Name and Base URL are required");
      return;
    }
    setViewEnvSaving(true);
    try {
      const body: Record<string, unknown> = {
          name: viewEnvForm.name.trim(),
          baseUrl: viewEnvForm.baseUrl.trim(),
          applicationId: viewEnvForm.applicationId.trim() || undefined,
          type: viewEnvForm.type,
          isActive: viewEnvForm.isActive,
          apiAuthMode: viewEnvForm.apiAuthMode,
          e2eAuthMode: viewEnvForm.e2eAuthMode,
        };
      if (viewEnvForm.type === "API" && viewEnvForm.apiAuthMode === "BASIC_AUTH" && (viewEnvForm.appKey.trim() || viewEnvForm.secretKey.trim())) {
        if (viewEnvForm.appKey.trim()) body.appKey = viewEnvForm.appKey.trim();
        if (viewEnvForm.secretKey.trim()) body.secretKey = viewEnvForm.secretKey.trim();
      }
      if (viewEnvForm.type === "API" && viewEnvForm.apiAuthMode === "BEARER_TOKEN" && viewEnvForm.apiToken.trim()) {
        body.apiToken = viewEnvForm.apiToken.trim();
      }
      if (viewEnvForm.type === "E2E") {
        const valid = viewEnvForm.credentials.filter((c) => c.username.trim());
        if (valid.length > 0) {
          body.credentials = valid.map((c) => ({ role: c.role.trim() || undefined, username: c.username.trim(), password: c.password }));
        }
      }
      const res = await fetch(`/api/environments/${viewEnvironment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setViewEnvError(data.error?.message ?? (typeof data.error === "object" ? "Update failed" : data.error) ?? "Update failed");
        return;
      }
      setViewEnvironment({
        ...viewEnvironment,
        name: data.name ?? viewEnvForm.name,
        baseUrl: data.baseUrl ?? viewEnvForm.baseUrl,
        platform: data.platform ?? viewEnvironment.platform,
        applicationId: data.applicationId ?? viewEnvironment.applicationId,
        application: data.application ?? viewEnvironment.application,
        type: data.type ?? viewEnvForm.type,
        isActive: data.isActive ?? viewEnvForm.isActive,
        apiAuthMode: data.apiAuthMode ?? viewEnvironment.apiAuthMode,
        e2eAuthMode: data.e2eAuthMode ?? viewEnvironment.e2eAuthMode,
      });
      setViewEnvForm({
        ...viewEnvForm,
        name: data.name ?? viewEnvForm.name,
        baseUrl: data.baseUrl ?? viewEnvForm.baseUrl,
        applicationId: (data.applicationId ?? viewEnvForm.applicationId) ?? "",
        type: (data.type ?? viewEnvForm.type) as "API" | "E2E",
        isActive: data.isActive ?? viewEnvForm.isActive,
        appKey: "",
        secretKey: "",
        apiToken: "",
        credentials: viewEnvForm.credentials,
        apiAuthMode: data.apiAuthMode ?? viewEnvForm.apiAuthMode,
        e2eAuthMode: data.e2eAuthMode ?? viewEnvForm.e2eAuthMode,
      });
      loadEnvironments();
    } catch {
      setViewEnvError("Network error");
    } finally {
      setViewEnvSaving(false);
    }
  };

  const openTicketDrawer = () => {
    setTicketDrawerOpen(true);
    setTicketError("");
    setTicketForm({
      title: "",
      description: "",
      acceptanceCriteria: "",
      externalId: "",
      priority: "",
      applicationIds: [],
    });
  };

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError("");
    if (!ticketForm.title.trim()) {
      setTicketError("Title is required");
      return;
    }
    setTicketSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: ticketForm.title.trim(),
          description: ticketForm.description.trim() || undefined,
          acceptanceCriteria: ticketForm.acceptanceCriteria.trim() || undefined,
          externalId: ticketForm.externalId.trim() || undefined,
          priority: ticketForm.priority.trim() || undefined,
          applicationIds: ticketForm.applicationIds.length ? ticketForm.applicationIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTicketError(data.error?.message ?? (typeof data.error === "object" ? "Invalid input" : data.error) ?? "Failed to create");
        return;
      }
      setTicketDrawerOpen(false);
      loadTickets();
      if (project) setProject({ ...project, ticketsCount: (project.ticketsCount ?? 0) + 1 });
    } catch {
      setTicketError("Network error");
    } finally {
      setTicketSubmitting(false);
    }
  };

  function parseTicketFile(file: File): Promise<{ title: string; description?: string; acceptanceCriteria?: string; externalId?: string; priority?: string; applicationIds?: string[] }[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = (reader.result as string) ?? "";
          const ext = file.name.split(".").pop()?.toLowerCase();
          if (ext === "json") {
            const data = JSON.parse(text);
            const arr = Array.isArray(data) ? data : data.tickets ?? [];
            resolve(
              arr.map((row: Record<string, unknown>) => ({
                title: String(row.title ?? ""),
                description: row.description != null ? String(row.description) : undefined,
                acceptanceCriteria: row.acceptanceCriteria != null ? String(row.acceptanceCriteria) : undefined,
                externalId: row.externalId != null ? String(row.externalId) : undefined,
                priority: row.priority != null ? String(row.priority) : undefined,
                applicationIds: Array.isArray(row.applicationIds) ? row.applicationIds.map(String) : undefined,
              }))
            );
          } else {
            const lines = text.split(/\r?\n/).filter((l) => l.trim());
            if (lines.length < 2) {
              reject(new Error("CSV must have a header and at least one row"));
              return;
            }
            const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
            const titleIdx = header.indexOf("title");
            if (titleIdx === -1) {
              reject(new Error("CSV must have a title column"));
              return;
            }
            const descIdx = header.indexOf("description");
            const acIdx = header.indexOf("acceptancecriteria");
            const extIdx = header.indexOf("externalid");
            const priIdx = header.indexOf("priority");
            const appIdsIdx = header.indexOf("applicationids");
            const rows: { title: string; description?: string; acceptanceCriteria?: string; externalId?: string; priority?: string; applicationIds?: string[] }[] = [];
            for (let i = 1; i < lines.length; i++) {
              const cells = lines[i].split(",").map((c) => c.trim());
              const title = cells[titleIdx] ?? "";
              if (!title) continue;
              const appIdsStr = appIdsIdx >= 0 ? cells[appIdsIdx] : undefined;
              rows.push({
                title,
                description: descIdx >= 0 && cells[descIdx] ? cells[descIdx] : undefined,
                acceptanceCriteria: acIdx >= 0 && cells[acIdx] ? cells[acIdx] : undefined,
                externalId: extIdx >= 0 && cells[extIdx] ? cells[extIdx] : undefined,
                priority: priIdx >= 0 && cells[priIdx] ? cells[priIdx] : undefined,
                applicationIds: appIdsStr ? appIdsStr.split(";").map((p) => p.trim()).filter(Boolean) : undefined,
              });
            }
            resolve(rows);
          }
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, "UTF-8");
    });
  }

  const openImportDialog = () => {
    setImportDialogOpen(true);
    setImportFile(null);
    setImportError("");
    setImportResult(null);
  };

  const handleImportFile = (file: File | null) => {
    setImportFile(file);
    setImportError("");
    setImportResult(null);
  };

  const handleImportSubmit = async () => {
    if (!id || !importFile) return;
    setImportError("");
    setImportSubmitting(true);
    try {
      const tickets = await parseTicketFile(importFile);
      if (tickets.length === 0) {
        setImportError("No tickets found in file (title required)");
        setImportSubmitting(false);
        return;
      }
      const res = await fetch("/api/tickets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, tickets }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error?.message ?? (typeof data.error === "object" ? "Import failed" : data.error) ?? "Import failed");
        return;
      }
      setImportResult(data.created ?? tickets.length);
      setImportFile(null);
      loadTickets();
      if (project) setProject({ ...project, ticketsCount: (project.ticketsCount ?? 0) + (data.created ?? 0) });
      setTimeout(() => {
        setImportDialogOpen(false);
        setImportResult(null);
      }, 1500);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setImportSubmitting(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: "READY_TO_TEST" | "DONE" | "CANCEL") => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        loadTickets();
        if (data.aiGenerationError) {
          toast.error(data.aiGenerationError);
        } else if (data.aiQueueDisabled) {
          toast.warning("AI queue is disabled. Enable it in Config → AI Queue and save.");
        } else if (data.jobAlreadyQueued) {
          toast.info("This ticket already has a job in the queue (or is being processed).");
        } else if (data.aiGenerationTriggered) {
          toast.success("Generating test cases with AI… List will refresh in a moment.");
          setTimeout(() => { loadTickets(); loadTestCases(); }, 5000);
        }
      } else if (data.aiQueueError || data.error) {
        toast.error(data.error ?? "Failed to enqueue AI job.");
      }
    } catch {
      // ignore
    }
  };

  const updateTestCaseStatus = async (tcId: string, status: "READY" | "CANCEL") => {
    try {
      const res = await fetch(`/api/test-cases/${tcId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        loadTestCases();
        if (viewTestCase?.id === tcId) setViewTestCase(null);
      }
    } catch {
      // ignore
    }
  };

  const saveViewTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewTicket || !viewTicketEditForm) return;
    setViewTicketSaving(true);
    try {
      const res = await fetch(`/api/tickets/${viewTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: viewTicketEditForm.title,
          description: viewTicketEditForm.description || undefined,
          acceptanceCriteria: viewTicketEditForm.acceptanceCriteria || undefined,
          priority: viewTicketEditForm.priority || undefined,
          externalId: viewTicketEditForm.externalId || undefined,
          applicationIds: viewTicketEditForm.applicationIds.length ? viewTicketEditForm.applicationIds : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setViewTicketSaving(false);
        return;
      }
      const updated = await res.json();
      setViewTicket({
        ...viewTicket,
        ...updated,
        applicationIds: updated.applicationIds ?? viewTicket.applicationIds,
      });
      loadTickets();
    } finally {
      setViewTicketSaving(false);
    }
  };

  const openTcDrawer = () => {
    setTcDrawerOpen(true);
    setTcError("");
    loadTickets();
    setTcForm({
      title: "",
      ticketId: "",
      applicationId: "",
      priority: "MEDIUM",
      testType: "E2E",
      testSteps: [""],
      expectedResult: "",
      category: "",
      data_condition: "",
      setup_hint: "",
    });
  };

  const openTcHistory = (tc: TestCaseRow) => {
    setTcHistoryTestCase(tc);
    setTcHistoryExecutionIds([]);
    setTcHistoryIndex(0);
    setTcHistoryExecution(null);
    setTcHistoryLoading(true);
    fetch(`/api/test-cases/${tc.id}/executions`)
      .then((r) => (r.ok ? r.json() : { executions: [] }))
      .then((res) => {
        const ids = (res.executions ?? []).map((e: { id: string }) => e.id);
        setTcHistoryExecutionIds(ids);
        setTcHistoryLoading(false);
      })
      .catch(() => {
        setTcHistoryExecutionIds([]);
        setTcHistoryLoading(false);
      });
  };

  useEffect(() => {
    if (!tcHistoryTestCase || tcHistoryExecutionIds.length === 0) {
      setTcHistoryExecution(null);
      return;
    }
    const id = tcHistoryExecutionIds[tcHistoryIndex];
    if (!id) {
      setTcHistoryExecution(null);
      return;
    }
    setTcHistoryLoading(true);
    let cancelled = false;
    fetch(`/api/executions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setTcHistoryExecution(data); })
      .catch(() => { if (!cancelled) setTcHistoryExecution(null); })
      .finally(() => { if (!cancelled) setTcHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [tcHistoryTestCase, tcHistoryExecutionIds, tcHistoryIndex]);

  const openViewTc = (tc: TestCaseRow) => {
    setViewTestCase(tc);
    setViewTcError("");
    setViewTcLinkedTicket(null);
    if (tc.status === "DRAFT") {
      setViewTcForm({
        title: tc.title,
        ticketId: tc.ticketId ?? "",
        applicationId: tc.applicationId ?? "",
        priority: tc.priority,
        testType: tc.testType ?? "E2E",
        testSteps: tc.testSteps?.length ? [...tc.testSteps] : [""],
        expectedResult: tc.expectedResult ?? "",
        category: tc.category ?? "",
        data_condition: tc.data_condition ?? "",
        setup_hint: tc.setup_hint ?? "",
      });
      if (tc.ticketId && !tickets.some((t) => t.id === tc.ticketId)) {
        fetch(`/api/tickets/${tc.ticketId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.id)
              setViewTcLinkedTicket({
                id: data.id,
                title: data.title ?? "",
                description: data.description ?? null,
                acceptanceCriteria: data.acceptanceCriteria ?? null,
                status: data.status ?? "",
                externalId: data.externalId ?? null,
                priority: data.priority ?? null,
                applicationIds: Array.isArray(data.applicationIds) ? data.applicationIds : null,
                createdAt: data.createdAt ?? "",
                updatedAt: data.updatedAt ?? "",
              });
          })
          .catch(() => {});
      }
    } else {
      setViewTcForm(null);
      if (tc.ticketId) {
        const fromList = tickets.find((t) => t.id === tc.ticketId);
        if (fromList) setViewTcLinkedTicket(fromList);
        else {
          fetch(`/api/tickets/${tc.ticketId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.id)
                setViewTcLinkedTicket({
                  id: data.id,
                  title: data.title ?? "",
                  description: data.description ?? null,
                  acceptanceCriteria: data.acceptanceCriteria ?? null,
                  status: data.status ?? "",
                  externalId: data.externalId ?? null,
                  priority: data.priority ?? null,
                  applicationIds: Array.isArray(data.applicationIds) ? data.applicationIds : null,
                  createdAt: data.createdAt ?? "",
                  updatedAt: data.updatedAt ?? "",
                });
            })
            .catch(() => {});
        }
      }
    }
  };

  const saveViewTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewTestCase || !viewTcForm) return;
    setViewTcError("");
    if (!viewTcForm.title.trim()) {
      setViewTcError("Title is required");
      return;
    }
    setViewTcSaving(true);
    try {
      const res = await fetch(`/api/test-cases/${viewTestCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: viewTcForm.title.trim(),
          ticketId: viewTcForm.ticketId.trim() || null,
          applicationId: viewTcForm.applicationId.trim() || null,
          priority: viewTcForm.priority,
          testType: viewTcForm.testType,
          testSteps: viewTcForm.testSteps.filter((s) => s.trim()).length > 0 ? viewTcForm.testSteps.filter((s) => s.trim()) : [],
          expectedResult: viewTcForm.expectedResult.trim() || null,
          category: viewTcForm.category.trim() || null,
          data_condition: viewTcForm.data_condition.trim() || null,
          setup_hint: viewTcForm.setup_hint.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setViewTcError(data.error?.message ?? (typeof data.error === "object" ? "Update failed" : data.error) ?? "Update failed");
        return;
      }
      setViewTestCase((prev) => prev ? { ...prev, ...data } : null);
      loadTestCases();
    } catch {
      setViewTcError("Network error");
    } finally {
      setViewTcSaving(false);
    }
  };

  const createTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setTcError("");
    if (!tcForm.title.trim()) {
      setTcError("Title is required");
      return;
    }
    setTcSubmitting(true);
    try {
      const res = await fetch("/api/test-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          title: tcForm.title.trim(),
          ticketId: tcForm.ticketId.trim() || undefined,
          applicationId: tcForm.applicationId.trim() || undefined,
          priority: tcForm.priority,
          status: "DRAFT",
          testType: tcForm.testType,
          testSteps: tcForm.testSteps.filter((s) => s.trim()).length > 0 ? tcForm.testSteps.filter((s) => s.trim()) : undefined,
          expectedResult: tcForm.expectedResult.trim() || undefined,
          category: tcForm.category.trim() || undefined,
          data_condition: tcForm.data_condition.trim() || undefined,
          setup_hint: tcForm.setup_hint.trim() || undefined,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTcError(data.error?.message ?? (typeof data.error === "object" ? "Invalid input" : data.error) ?? "Failed to create");
        return;
      }
      setTcDrawerOpen(false);
      loadTestCases();
    } catch {
      setTcError("Network error");
    } finally {
      setTcSubmitting(false);
    }
  };

  const selectClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";
  const selectClassInline =
    "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects">← Back to Projects</Link>
        </Button>
        <p className="py-12 text-center text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={project.name}
        subtitle={project.jiraProjectKey ? `Jira: ${project.jiraProjectKey}` : undefined}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/projects">← Back to Projects</Link>
          </Button>
        }
      />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <div>
                <SheetTitle>Edit project</SheetTitle>
                <SheetDescription>Change project name and Jira key</SheetDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button type="submit" form="edit-project-form" disabled={saveLoading} size="sm">
                  {saveLoading ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDrawerOpen(false)}
                  disabled={saveLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </SheetHeader>
          <form id="edit-project-form" onSubmit={saveProject} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="edit-name" className="block text-sm font-medium text-muted-foreground">
                    Project name
                  </label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Project name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="edit-jira" className="block text-sm font-medium text-muted-foreground">
                    Jira project key (optional)
                  </label>
                  <Input
                    id="edit-jira"
                    value={editJiraKey}
                    onChange={(e) => setEditJiraKey(e.target.value)}
                    placeholder="e.g. MYAPP"
                  />
                </div>
                {saveError && <p className="text-sm text-destructive">{saveError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Tickets, test cases, passed & failed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tickets</span>
              <span className="font-medium text-foreground">{project.ticketsCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Test cases</span>
              <span className="font-medium text-foreground">{project._count.testCases}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Test passed</span>
              <span className="font-medium text-success">{project.passedCount ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Test failed</span>
              <span className="font-medium text-destructive">{project.failedCount ?? 0}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Executions</CardTitle>
            <CardDescription>Test runs &amp; executions by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-0">
              <div className="space-y-3 border-r border-border pr-4 text-center">
                <p className="text-sm text-muted-foreground">Test runs (total)</p>
                <p className="text-2xl font-semibold text-foreground tabular-nums">{formatShortNumber(project.testRunTotal ?? 0)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">RUNNING</span>
                    <p className="font-medium tabular-nums text-foreground">{formatShortNumber(project.testRunRunningCount ?? 0)}</p>
                  </div>
                  <div className="text-center">
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground">COMPLETED</span>
                    <p className="font-medium tabular-nums text-foreground">{formatShortNumber(project.testRunCompletedCount ?? 0)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3 pl-4 text-center">
                <p className="text-sm text-muted-foreground">Executions (total)</p>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{formatShortNumber(project._count.executions)}</p>
                <div className="grid grid-cols-3 gap-1">
                  <div className="min-w-0 text-center">
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground truncate">RUNNING</span>
                    <p className="font-medium tabular-nums text-foreground">{formatShortNumber(project.executionRunningCount ?? 0)}</p>
                  </div>
                  <div className="min-w-0 text-center">
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground truncate">PASSED</span>
                    <p className="font-medium tabular-nums text-success">{formatShortNumber(project.passedCount ?? 0)}</p>
                  </div>
                  <div className="min-w-0 text-center">
                    <span className="block text-[0.65rem] uppercase tracking-wide text-muted-foreground truncate">FAILED</span>
                    <p className="font-medium tabular-nums text-destructive">{formatShortNumber(project.failedCount ?? 0)}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative">
          <button
            type="button"
            onClick={openDrawer}
            className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            aria-label="Edit project"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Strategy</span>
              <span className="text-foreground">{project.defaultExecutionStrategy}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={project.isActive ? "text-success" : "text-muted-foreground"}>
                {project.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 overflow-visible">
        <div className="border-b border-border flex items-center justify-between gap-2">
          <nav className="flex gap-1" aria-label="Project sections">
            <button
              type="button"
              onClick={() => setProjectDetailTab("applications")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "applications"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Applications
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("environments")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "environments"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Environments
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("tickets")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "tickets"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("test-cases")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "test-cases"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Test cases
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("test-runs")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "test-runs"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Test Runs
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("data-knowledge")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "data-knowledge"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Data Knowledge
            </button>
            <button
              type="button"
              onClick={() => setProjectDetailTab("selector-knowledge")}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                projectDetailTab === "selector-knowledge"
                  ? "border-accent text-foreground bg-elevated/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Selector Knowledge
            </button>
          </nav>
          <Button
            size="sm"
            disabled={exportTcLoading}
            onClick={async () => {
              setExportTcLoading(true);
              try {
                const res = await fetch(`/api/projects/${id}/export-test-cases`);
                if (res.status === 404) {
                  const data = await res.json().catch(() => ({}));
                  toast.error(data.error ?? "No test cases available for export");
                  return;
                }
                if (!res.ok) {
                  toast.error("Export failed");
                  return;
                }
                const blob = await res.blob();
                const disposition = res.headers.get("Content-Disposition");
                const match = disposition?.match(/filename="?([^";]+)"?/);
                const filename = match?.[1] ?? "TestCases.xlsx";
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Export downloaded");
              } catch {
                toast.error("Export failed");
              } finally {
                setExportTcLoading(false);
              }
            }}
          >
            <Download className="h-4 w-4 mr-1.5" />
            {exportTcLoading ? "Exporting…" : "Export Test Cases"}
          </Button>
        </div>
        {projectDetailTab === "applications" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Applications</CardTitle>
                <CardDescription>Applications in this project (name, code, platform, test type)</CardDescription>
              </div>
              {userRole !== "qa" && (
                <Button size="sm" onClick={openAppDrawer}>
                  Add application
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Search by name, code, description…"
                  value={appSearchInput}
                  onChange={(e) => setAppSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyAppSearch()}
                  className="max-w-xs"
                />
                <Button type="button" variant="secondary" size="sm" onClick={applyAppSearch}>
                  Search
                </Button>
                <select
                  value={appPlatform}
                  onChange={(e) => { setAppPlatform(e.target.value); setAppPage(1); }}
                  className={selectClassInline}
                >
                  <option value="">All platforms</option>
                  {platformOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={appEnabled}
                  onChange={(e) => { setAppEnabled(e.target.value); setAppPage(1); }}
                  className={selectClassInline}
                >
                  <option value="">All statuses</option>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <select
                  value={appLimit}
                  onChange={(e) => { setAppLimit(Number(e.target.value)); setAppPage(1); }}
                  className={selectClassInline}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="whitespace-nowrap">/ page, total {appTotal} records</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button variant="secondary" size="sm" onClick={() => goToAppPage(appPage - 1)} disabled={appPage <= 1}>
                    Previous
                  </Button>
                  {appTotalPages <= 1 ? (
                    <span className="px-2 text-sm">Page 1 of 1</span>
                  ) : (
                    (() => {
                      const maxVisible = 10;
                      const startPage = Math.max(1, Math.min(appPage - 4, appTotalPages - maxVisible + 1));
                      const endPage = Math.min(appTotalPages, startPage + maxVisible - 1);
                      const pages: number[] = [];
                      for (let p = startPage; p <= endPage; p++) pages.push(p);
                      return (
                        <div className="flex items-center gap-0.5">
                          {pages.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => goToAppPage(p)}
                              className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                                p === appPage ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  )}
                  <Button variant="secondary" size="sm" onClick={() => goToAppPage(appPage + 1)} disabled={appPage >= appTotalPages}>
                    Next
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" onClick={() => handleAppSort("name")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Name
                        {appSortBy === "name" && (appSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleAppSort("code")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Code
                        {appSortBy === "code" && (appSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleAppSort("platform")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Platform
                        {appSortBy === "platform" && (appSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>Test type</TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleAppSort("enabled")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Enabled
                        {appSortBy === "enabled" && (appSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead className="w-[1%] whitespace-nowrap" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : applications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        No applications. Add one above.
                      </TableCell>
                    </TableRow>
                  ) : (
                    applications.map((app) => (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium">{app.name}</TableCell>
                        <TableCell className="font-mono text-sm">{app.code}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{app.description ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{app.platform ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes.join(", ") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={app.enabled ? "success" : "default"}>{app.enabled ? "Yes" : "No"}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="secondary" size="sm" onClick={() => openViewApp(app)}>
                              View
                            </Button>
                            {userRole !== "qa" && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setAppConfirmDeleteId(app.id)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {appDeleteError && <p className="text-sm text-destructive">{appDeleteError}</p>}
            </CardContent>
          </Card>
        )}
        {projectDetailTab === "environments" && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Environments</CardTitle>
            <CardDescription>Configured environments for this project</CardDescription>
          </div>
          {userRole !== "qa" && (
            <Button size="sm" onClick={openEnvDrawer}>
              Add environment
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by name or base URL…"
              value={envSearchInput}
              onChange={(e) => setEnvSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyEnvSearch()}
              className="max-w-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={applyEnvSearch}>
              Search
            </Button>
            <select
              value={envType}
              onChange={(e) => { setEnvType(e.target.value); setEnvPage(1); }}
              className={selectClassInline}
            >
              <option value="">All types</option>
              <option value="E2E">E2E</option>
              <option value="API">API</option>
            </select>
            <select
              value={envStatus}
              onChange={(e) => { setEnvStatus(e.target.value); setEnvPage(1); }}
              className={selectClassInline}
            >
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <select
              value={envLimit}
              onChange={(e) => { setEnvLimit(Number(e.target.value)); setEnvPage(1); }}
              className={selectClassInline}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="whitespace-nowrap">/ page, total {envTotal} records</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToEnvPage(envPage - 1)}
                disabled={envPage <= 1}
              >
                Previous
              </Button>
              {envTotalPages <= 1 ? (
                <span className="px-2 text-sm">Page 1 of 1</span>
              ) : (
                (() => {
                  const maxVisible = 10;
                  const startPage = Math.max(1, Math.min(envPage - 4, envTotalPages - maxVisible + 1));
                  const endPage = Math.min(envTotalPages, startPage + maxVisible - 1);
                  const pages: number[] = [];
                  for (let p = startPage; p <= endPage; p++) pages.push(p);
                  return (
                    <div className="flex items-center gap-0.5">
                      {pages.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => goToEnvPage(p)}
                          className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                            p === envPage
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToEnvPage(envPage + 1)}
                disabled={envPage >= envTotalPages}
              >
                Next
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => handleEnvSort("name")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Name
                    {envSortBy === "name" && (envSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleEnvSort("isActive")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Status
                    {envSortBy === "isActive" && (envSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleEnvSort("baseUrl")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Base URL
                    {envSortBy === "baseUrl" && (envSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleEnvSort("type")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Type
                    {envSortBy === "type" && (envSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>Application</TableHead>
                <TableHead className="w-[200px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : environments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No environments. Add one to run tests.
                  </TableCell>
                </TableRow>
              ) : (
                environments.map((env) => (
                  <TableRow key={env.id}>
                    <TableCell className="font-medium">{env.name}</TableCell>
                    <TableCell>
                      <Badge variant={env.isActive ? "success" : "default"}>
                        {env.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{env.baseUrl}</TableCell>
                    <TableCell>{env.type}</TableCell>
                    <TableCell className="text-muted-foreground">{env.application?.name ?? env.platform ?? "—"}</TableCell>
                    <TableCell className="space-x-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                        setViewEnvironment(env);
                      setViewEnvForm({
                        name: env.name,
                        baseUrl: env.baseUrl,
                        applicationId: env.applicationId ?? "",
                        type: env.type as "API" | "E2E",
                        isActive: env.isActive,
                        appKey: "",
                        secretKey: "",
                        apiToken: "",
                        credentials: [{ role: "", username: "", password: "" }],
                        apiAuthMode: (env as EnvironmentRow).apiAuthMode ?? "NONE",
                        e2eAuthMode: (env as EnvironmentRow).e2eAuthMode ?? "NEVER_AUTH",
                      });
                      setViewEnvError("");
                      fetch(`/api/environments/${env.id}`)
                        .then((r) => (r.ok ? r.json() : null))
                        .then((data) => {
                          if (!data) return;
                          setViewEnvForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  name: data.name ?? prev.name,
                                  baseUrl: data.baseUrl ?? prev.baseUrl,
                                  applicationId: data.applicationId ?? prev.applicationId ?? "",
                                  type: (data.type ?? prev.type) as "API" | "E2E",
                                  isActive: data.isActive ?? prev.isActive,
                                  apiAuthMode: data.apiAuthMode ?? prev.apiAuthMode,
                                  e2eAuthMode: data.e2eAuthMode ?? prev.e2eAuthMode,
                                  credentials:
                                    Array.isArray(data.credentials) && data.credentials.length > 0
                                      ? data.credentials.map((c: { role?: string; username: string; password: string }) => ({
                                          role: c.role ?? "",
                                          username: c.username ?? "",
                                          password: "",
                                        }))
                                      : prev.credentials,
                                }
                              : null
                          );
                        })
                        .catch(() => {});
                    }}
                    >
                      View
                    </Button>
                    {userRole !== "qa" && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => { setEnvDeleteError(""); setEnvConfirmDeleteId(env.id); }}
                      >
                        Delete
                      </Button>
                    )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        )}
        {projectDetailTab === "tickets" && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Tickets</CardTitle>
            <CardDescription>Source items for creating test cases</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={openImportDialog}>
              Import
            </Button>
            <Button size="sm" onClick={openTicketDrawer}>
              Add ticket
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by title or description…"
              value={ticketSearchInput}
              onChange={(e) => setTicketSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTicketSearch()}
              className="max-w-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={applyTicketSearch}>
              Search
            </Button>
            <select
              value={ticketStatus}
              onChange={(e) => { setTicketStatus(e.target.value); setTicketPage(1); }}
              className={selectClassInline}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="READY_TO_TEST">READY_TO_TEST</option>
              <option value="DONE">DONE</option>
              <option value="CANCEL">CANCEL</option>
            </select>
            <select
              value={ticketPriority}
              onChange={(e) => { setTicketPriority(e.target.value); setTicketPage(1); }}
              className={selectClassInline}
            >
              <option value="">All priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <select
              value={ticketLimit}
              onChange={(e) => { setTicketLimit(Number(e.target.value)); setTicketPage(1); }}
              className={selectClassInline}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="whitespace-nowrap">/ page, total {ticketTotal} records</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToTicketPage(ticketPage - 1)}
                disabled={ticketPage <= 1}
              >
                Previous
              </Button>
              {ticketTotalPages <= 1 ? (
                <span className="px-2 text-sm">Page 1 of 1</span>
              ) : (
                (() => {
                  const maxVisible = 10;
                  const startPage = Math.max(1, Math.min(ticketPage - 4, ticketTotalPages - maxVisible + 1));
                  const endPage = Math.min(ticketTotalPages, startPage + maxVisible - 1);
                  const pages: number[] = [];
                  for (let p = startPage; p <= endPage; p++) pages.push(p);
                  return (
                    <div className="flex items-center gap-0.5">
                      {pages.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => goToTicketPage(p)}
                          className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                            p === ticketPage
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToTicketPage(ticketPage + 1)}
                disabled={ticketPage >= ticketTotalPages}
              >
                Next
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => handleTicketSort("title")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Title
                    {ticketSortBy === "title" && (ticketSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTicketSort("status")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Status
                    {ticketSortBy === "status" && (ticketSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTicketSort("priority")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Priority
                    {ticketSortBy === "priority" && (ticketSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>External ID</TableHead>
                <TableHead>TCs</TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTicketSort("updatedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Updated
                    {ticketSortBy === "updatedAt" && (ticketSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead className="w-[200px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ticketLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No tickets. Add one or adjust filters.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === "DONE"
                            ? "success"
                            : t.status === "CANCEL"
                              ? "queued"
                              : t.status === "READY_TO_TEST"
                                ? "running"
                                : "default"
                        }
                        className={
                          t.status === "DRAFT"
                            ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                            : t.status === "READY_TO_TEST"
                              ? "bg-blue-600/15 text-blue-400 border-blue-500/30"
                              : undefined
                        }
                      >
                        {t.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.priority ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {Array.isArray(t.applicationIds) && t.applicationIds.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {t.applicationIds.map((appId) => {
                            const app = ticketApplicationOptions.find((a) => a.id === appId);
                            return (
                              <Badge key={appId} variant="default">
                                {app ? `${app.name} (${app.code})` : appId}
                              </Badge>
                            );
                          })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.externalId ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{t._count?.testCases ?? 0}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="relative overflow-visible space-x-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setViewTicket(t);
                          if (t.status === "DRAFT") {
                            setViewTicketEditForm({
                              title: t.title,
                              description: t.description ?? "",
                              acceptanceCriteria: t.acceptanceCriteria ?? "",
                              priority: t.priority ?? "",
                              externalId: t.externalId ?? "",
                              applicationIds: Array.isArray(t.applicationIds) ? [...t.applicationIds] : [],
                            });
                          }
                        }}
                      >
                        View
                      </Button>
                      {t.status === "DRAFT" && (
                        <div
                          ref={ticketActionDropdownId === t.id ? ticketActionDropdownRef : null}
                          className="relative inline-flex rounded-md border border-border"
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-r-none border-0 border-r border-border"
                            onClick={() => setTicketConfirmAction({ ticketId: t.id, status: "READY_TO_TEST" })}
                          >
                            Ready
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-l-none px-1.5"
                            onClick={() => setTicketActionDropdownId((cur) => (cur === t.id ? null : t.id))}
                          >
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                          </Button>
                          {ticketActionDropdownId === t.id && (
                            <div className="absolute right-0 top-full z-[100] mt-1.5 min-w-[8rem] rounded-lg border border-border bg-surface py-1 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 rounded-lg"
                                onClick={() => {
                                  setTicketActionDropdownId(null);
                                  setTicketConfirmAction({ ticketId: t.id, status: "CANCEL" });
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {t.status === "READY_TO_TEST" && (
                        <div
                          ref={ticketActionDropdownId === t.id ? ticketActionDropdownRef : null}
                          className="relative inline-flex rounded-md border border-border"
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-r-none border-0 border-r border-border"
                            onClick={() => setTicketConfirmAction({ ticketId: t.id, status: "DONE" })}
                          >
                            Done
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-l-none px-1.5"
                            onClick={() => setTicketActionDropdownId((cur) => (cur === t.id ? null : t.id))}
                          >
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                          </Button>
                          {ticketActionDropdownId === t.id && (
                            <div className="absolute right-0 top-full z-[100] mt-1.5 min-w-[8rem] rounded-lg border border-border bg-surface py-1 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 rounded-lg"
                                onClick={() => {
                                  setTicketActionDropdownId(null);
                                  setTicketConfirmAction({ ticketId: t.id, status: "CANCEL" });
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {(t.status === "DONE" || t.status === "CANCEL") && <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        )}
        {projectDetailTab === "test-cases" && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Test cases</CardTitle>
            <CardDescription>Test cases in this project. Search, filter, and paginate.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => loadTestCases()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
            <Button size="sm" onClick={openTcDrawer}>
              Add test case
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Search by title…"
              value={tcSearchInput}
              onChange={(e) => setTcSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyTcSearch()}
              className="max-w-xs"
            />
            <Button type="button" variant="secondary" size="sm" onClick={applyTcSearch}>
              Search
            </Button>
            <select
              value={tcPriority}
              onChange={(e) => { setTcPriority(e.target.value); setTcPage(1); }}
              className={selectClassInline}
            >
              <option value="">All priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <select
              value={tcStatus}
              onChange={(e) => { setTcStatus(e.target.value); setTcPage(1); }}
              className={selectClassInline}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="READY">READY</option>
              <option value="TESTING">TESTING</option>
              <option value="PASSED">PASSED</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCEL">CANCEL</option>
              <option value="IGNORE">IGNORE</option>
            </select>
            <select
              value={tcTestType}
              onChange={(e) => { setTcTestType(e.target.value); setTcPage(1); }}
              className={selectClassInline}
            >
              <option value="">All types</option>
              <option value="E2E">E2E</option>
              <option value="API">API</option>
            </select>
            <select
              value={tcPlatform}
              onChange={(e) => { setTcPlatform(e.target.value); setTcPage(1); }}
              className={selectClassInline}
            >
              <option value="">All platforms</option>
              {platformOptions.length > 0 ? platformOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              )) : null}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <select
              value={tcLimit}
              onChange={(e) => { setTcLimit(Number(e.target.value)); setTcPage(1); }}
              className={selectClassInline}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="whitespace-nowrap">/ page, total {tcTotal} records</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToTcPage(tcPage - 1)}
                disabled={tcPage <= 1 || tcLoading}
              >
                Previous
              </Button>
              {tcTotalPages <= 1 ? (
                <span className="px-2 text-sm">Page 1 of 1</span>
              ) : (
                (() => {
                  const maxVisible = 10;
                  const startPage = Math.max(1, Math.min(tcPage - 4, tcTotalPages - maxVisible + 1));
                  const endPage = Math.min(tcTotalPages, startPage + maxVisible - 1);
                  const pages: number[] = [];
                  for (let p = startPage; p <= endPage; p++) pages.push(p);
                  return (
                    <div className="flex items-center gap-0.5">
                      {pages.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => goToTcPage(p)}
                          className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                            p === tcPage
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  );
                })()
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goToTcPage(tcPage + 1)}
                disabled={tcPage >= tcTotalPages || tcLoading}
              >
                Next
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button type="button" onClick={() => handleTcSort("title")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Title
                    {tcSortBy === "title" && (tcSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTcSort("status")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Status
                    {tcSortBy === "status" && (tcSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTcSort("priority")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Priority
                    {tcSortBy === "priority" && (tcSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Expected result</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>
                  <button type="button" onClick={() => handleTcSort("updatedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                    Updated
                    {tcSortBy === "updatedAt" && (tcSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                  </button>
                </TableHead>
                <TableHead className="w-[200px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tcLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : testCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    No test cases. Add one or adjust filters.
                  </TableCell>
                </TableRow>
              ) : (
                testCases.map((tc) => (
                  <TableRow key={tc.id}>
                    <TableCell className="font-medium">{tc.title}</TableCell>
                    <TableCell title={tc.status === "IGNORE" && tc.ignoreReason ? tc.ignoreReason : undefined}>
                      <Badge
                        variant={
                          tc.status === "PASSED"
                            ? "success"
                            : tc.status === "FAILED"
                              ? "destructive"
                              : tc.status === "READY" || tc.status === "TESTING"
                                ? "running"
                                : tc.status === "IGNORE" || tc.status === "CANCEL"
                                  ? "queued"
                                  : "default"
                        }
                        className={
                          tc.status === "DRAFT"
                            ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                            : tc.status === "READY"
                              ? "bg-blue-600/15 text-blue-400 border-blue-500/30"
                              : tc.status === "TESTING"
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : undefined
                        }
                      >
                        {tc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">{tc.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{Array.isArray(tc.testSteps) ? tc.testSteps.length : 0}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={tc.expectedResult ?? ""}>{tc.expectedResult ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{tc.source}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                      {tc.updatedAt ? new Date(tc.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </TableCell>
                    <TableCell className="relative overflow-visible space-x-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => openViewTc(tc)}>
                        View
                      </Button>
                      {tc.status !== "DRAFT" && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => openTcHistory(tc)}>
                          <History className="h-3.5 w-3.5 mr-1" />
                          History
                        </Button>
                      )}
                      {tc.status === "DRAFT" && (
                        <div ref={tcActionDropdownId === tc.id ? tcActionDropdownRef : null} className="relative inline-flex rounded-md border border-border">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-r-none border-0 border-r border-border"
                            onClick={() => setTcConfirmAction({ tcId: tc.id, status: "READY" })}
                          >
                            Ready
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="rounded-l-none px-1.5"
                            onClick={() => setTcActionDropdownId((cur) => (cur === tc.id ? null : tc.id))}
                          >
                            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                          </Button>
                          {tcActionDropdownId === tc.id && (
                            <div className="absolute right-0 top-full z-[100] mt-1.5 min-w-[8rem] rounded-lg border border-border bg-surface py-1 shadow-xl ring-1 ring-black/10 dark:ring-white/10">
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 rounded-lg"
                                onClick={() => {
                                  setTcActionDropdownId(null);
                                  setTcConfirmAction({ tcId: tc.id, status: "CANCEL" });
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        )}
        {projectDetailTab === "test-runs" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Test Runs</CardTitle>
                <CardDescription>Schedule-driven test runs for this project. Filter, sort, and paginate.</CardDescription>
              </div>
              <Button size="sm" variant="secondary" onClick={() => loadTestRuns()}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={trStatus}
                  onChange={(e) => { setTrStatus(e.target.value); setTrPage(1); }}
                  className={selectClassInline}
                >
                  <option value="">All statuses</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="COMPLETED">COMPLETED</option>
                </select>
                <select
                  value={trLimit}
                  onChange={(e) => { setTrLimit(Number(e.target.value)); setTrPage(1); }}
                  className={selectClassInline}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="whitespace-nowrap">/ page, total {trTotal} records</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToTrPage(trPage - 1)}
                    disabled={trPage <= 1 || testRunsLoading}
                  >
                    Previous
                  </Button>
                  {trTotalPages <= 1 ? (
                    <span className="px-2 text-sm">Page 1 of 1</span>
                  ) : (
                    (() => {
                      const maxVisible = 10;
                      const startPage = Math.max(1, Math.min(trPage - 4, trTotalPages - maxVisible + 1));
                      const endPage = Math.min(trTotalPages, startPage + maxVisible - 1);
                      const pages: number[] = [];
                      for (let p = startPage; p <= endPage; p++) pages.push(p);
                      return (
                        <div className="flex items-center gap-0.5">
                          {pages.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => goToTrPage(p)}
                              className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                                p === trPage
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToTrPage(trPage + 1)}
                    disabled={trPage >= trTotalPages || testRunsLoading}
                  >
                    Next
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run ID</TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleTrSort("startedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Started
                        {trSortBy === "startedAt" && (trSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleTrSort("completedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Completed
                        {trSortBy === "completedAt" && (trSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" onClick={() => handleTrSort("status")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                        Status
                        {trSortBy === "status" && (trSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                      </button>
                    </TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Passed</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead className="w-[120px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testRunsLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : testRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        No test runs yet. Adjust filters or run tests.
                      </TableCell>
                    </TableRow>
                  ) : (
                    testRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono text-sm">{run.id.slice(0, 8)}…</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                          {run.startedAt ? new Date(run.startedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                          {run.completedAt ? new Date(run.completedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={run.status === "COMPLETED" ? "success" : "default"}>{run.status}</Badge>
                        </TableCell>
                        <TableCell>{run.totalExecutions}</TableCell>
                        <TableCell>{run.passed}</TableCell>
                        <TableCell>{run.failed}</TableCell>
                        <TableCell>
                          <Button type="button" variant="secondary" size="sm" onClick={() => { setViewTestRunId(run.id); setRunDetailPage(1); }}>
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {projectDetailTab === "data-knowledge" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Data Knowledge</CardTitle>
                <CardDescription>Structured test input storage used by the resolver layer. Key + type + scenario + role identify entries. Source (FIXED / AI_SIMULATION / USER_INPUT), Verified, and Previously passed drive failure classification (e.g. FAILED_UNVERIFIED_DATA when assertion fails on unverified AI data).</CardDescription>
              </div>
              {userRole !== "qa" && (
                <Button size="sm" onClick={() => openDkModal()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Data
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Search by key, type, scenario, role…"
                  value={dkSearchInput}
                  onChange={(e) => setDkSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyDkSearch()}
                  className="max-w-xs"
                />
                <Button type="button" variant="secondary" size="sm" onClick={applyDkSearch}>
                  Search
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <select
                  value={dkLimit}
                  onChange={(e) => { setDkLimit(Number(e.target.value)); setDkPage(1); }}
                  className={selectClassInline}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="whitespace-nowrap">/ page, total {dkTotal} records</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button variant="secondary" size="sm" onClick={() => goToDkPage(dkPage - 1)} disabled={dkPage <= 1 || dataKnowledgeLoading}>
                    Previous
                  </Button>
                  {dkTotalPages <= 1 ? (
                    <span className="px-2 text-sm">Page 1 of 1</span>
                  ) : (
                    (() => {
                      const maxVisible = 10;
                      const startPage = Math.max(1, Math.min(dkPage - 4, dkTotalPages - maxVisible + 1));
                      const endPage = Math.min(dkTotalPages, startPage + maxVisible - 1);
                      const pages: number[] = [];
                      for (let p = startPage; p <= endPage; p++) pages.push(p);
                      return (
                        <div className="flex items-center gap-0.5">
                          {pages.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => goToDkPage(p)}
                              className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                                p === dkPage ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  )}
                  <Button variant="secondary" size="sm" onClick={() => goToDkPage(dkPage + 1)} disabled={dkPage >= dkTotalPages || dataKnowledgeLoading}>
                    Next
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">
                        <button type="button" onClick={() => handleDkSort("key")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Key
                          {dkSortBy === "key" && (dkSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[120px]">
                        <button type="button" onClick={() => handleDkSort("type")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Type
                          {dkSortBy === "type" && (dkSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[120px]">
                        <button type="button" onClick={() => handleDkSort("scenario")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Scenario
                          {dkSortBy === "scenario" && (dkSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        <button type="button" onClick={() => handleDkSort("role")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Role
                          {dkSortBy === "role" && (dkSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[100px] text-muted-foreground font-normal">Source</TableHead>
                      <TableHead className="min-w-[80px] text-muted-foreground font-normal">Verified</TableHead>
                      <TableHead className="min-w-[80px] text-muted-foreground font-normal">Previously passed</TableHead>
                      <TableHead className="whitespace-nowrap w-36">
                        <button type="button" onClick={() => handleDkSort("updatedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Updated At
                          {dkSortBy === "updatedAt" && (dkSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      {userRole !== "qa" && <TableHead className="w-[1%] whitespace-nowrap" aria-label="Actions" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataKnowledgeLoading ? (
                      <TableRow>
                        <TableCell colSpan={userRole !== "qa" ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : dataKnowledge.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={userRole !== "qa" ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">
                          No data knowledge yet. Add data above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dataKnowledge.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-[180px] font-mono text-sm align-top break-all">{row.key}</TableCell>
                          <TableCell className="min-w-[120px] font-mono text-sm align-top">{row.type}</TableCell>
                          <TableCell className="min-w-[120px] font-mono text-sm align-top">{row.scenario}</TableCell>
                          <TableCell className="min-w-[100px] font-mono text-sm align-top">{row.role ?? "—"}</TableCell>
                          <TableCell className="min-w-[100px] text-sm align-top">
                            <span className={row.source === "AI_SIMULATION" ? "text-warning" : row.source === "USER_INPUT" ? "text-muted-foreground" : ""}>
                              {row.source ?? "FIXED"}
                            </span>
                          </TableCell>
                          <TableCell className="min-w-[80px] text-sm align-top">
                            {row.verified === true ? "Yes" : "No"}
                          </TableCell>
                          <TableCell className="min-w-[80px] text-sm align-top">
                            {row.previouslyPassed === true ? "Yes" : "No"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-sm align-top">
                            {row.updatedAt ? new Date(row.updatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </TableCell>
                          {userRole !== "qa" && (
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Button type="button" variant="secondary" size="sm" onClick={() => openDkModal(row)}>
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDkConfirmDeleteId(row.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        {projectDetailTab === "selector-knowledge" && (
          <Card>
            <CardHeader>
              <CardTitle>Selector Knowledge</CardTitle>
              <CardDescription>
                Resolved selectors per application (reused across executions). Built during pre-execution when no knowledge exists.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 overflow-hidden">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Search by semantic key, selector, or application…"
                  value={skSearchInput}
                  onChange={(e) => setSkSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySkSearch()}
                  className="max-w-xs"
                />
                <Button type="button" variant="secondary" size="sm" onClick={applySkSearch}>
                  Search
                </Button>
                <select
                  value={skApplicationId}
                  onChange={(e) => { setSkApplicationId(e.target.value); setSkPage(1); }}
                  className={selectClassInline}
                >
                  <option value="">All applications</option>
                  {ticketApplicationOptions.map((app) => (
                    <option key={app.id} value={app.id}>{app.name || app.code || app.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <select
                  value={skLimit}
                  onChange={(e) => { setSkLimit(Number(e.target.value)); setSkPage(1); }}
                  className={selectClassInline}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="whitespace-nowrap">/ page, total {skTotal} records</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToSkPage(skPage - 1)}
                    disabled={skPage <= 1 || selectorKnowledgeLoading}
                  >
                    Previous
                  </Button>
                  {skTotalPages <= 1 ? (
                    <span className="px-2 text-sm">Page 1 of 1</span>
                  ) : (
                    (() => {
                      const maxVisible = 10;
                      const startPage = Math.max(1, Math.min(skPage - 4, skTotalPages - maxVisible + 1));
                      const endPage = Math.min(skTotalPages, startPage + maxVisible - 1);
                      const pages: number[] = [];
                      for (let p = startPage; p <= endPage; p++) pages.push(p);
                      return (
                        <div className="flex items-center gap-0.5">
                          {pages.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => goToSkPage(p)}
                              className={`min-w-[2rem] h-8 px-2 rounded text-sm font-medium transition-colors ${
                                p === skPage
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      );
                    })()
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => goToSkPage(skPage + 1)}
                    disabled={skPage >= skTotalPages || selectorKnowledgeLoading}
                  >
                    Next
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto -mx-6 px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">
                        <button type="button" onClick={() => handleSkSort("application")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Application
                          {skSortBy === "application" && (skSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[200px]">
                        <button type="button" onClick={() => handleSkSort("semanticKey")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Semantic key
                          {skSortBy === "semanticKey" && (skSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[200px]">
                        <button type="button" onClick={() => handleSkSort("selector")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Selector
                          {skSortBy === "selector" && (skSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="text-right w-20">
                        <button type="button" onClick={() => handleSkSort("usageCount")} className="flex items-center justify-end gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded ml-auto">
                          Usage
                          {skSortBy === "usageCount" && (skSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                      <TableHead className="whitespace-nowrap w-36">
                        <button type="button" onClick={() => handleSkSort("lastVerifiedAt")} className="flex items-center gap-1 font-medium hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded">
                          Last verified
                          {skSortBy === "lastVerifiedAt" && (skSortOrder === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectorKnowledgeLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : selectorKnowledge.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No selector knowledge yet. Run test executions to build knowledge or adjust filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectorKnowledge.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="min-w-[180px] align-top">
                            <span className="font-mono text-sm break-words">
                              {row.applicationName ?? row.applicationCode ?? row.applicationId?.slice(0, 8) ?? "—"}
                              {row.applicationCode && (
                                <span className="text-muted-foreground text-xs ml-1">({row.applicationCode})</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="min-w-[200px] font-mono text-sm align-top break-all" title={row.semanticKey}>{row.semanticKey}</TableCell>
                          <TableCell className="min-w-[200px] font-mono text-xs align-top break-all" title={row.selector}>{row.selector}</TableCell>
                          <TableCell className="text-right tabular-nums align-top">{row.usageCount}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-sm align-top">
                            {row.lastVerifiedAt ? new Date(row.lastVerifiedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Sheet open={!!viewTestRunId} onOpenChange={(open) => { if (!open) { setViewTestRunId(null); setViewTestRunDetail(null); } }}>
        <SheetContent side="right" className="flex flex-col w-full max-w-lg sm:max-w-xl">
          <SheetHeader className="flex flex-row items-center justify-between gap-4">
            <SheetTitle className="mb-0">Test Run Details</SheetTitle>
            {viewTestRunDetail && (
              <Badge
                variant={viewTestRunDetail.status === "COMPLETED" ? "success" : viewTestRunDetail.status === "RUNNING" ? "running" : "default"}
                className="shrink-0"
              >
                {viewTestRunDetail.status}
              </Badge>
            )}
            <SheetDescription className="sr-only">
              {viewTestRunDetail ? `Run ${viewTestRunDetail.id.slice(0, 8)}…` : "Loading…"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col flex-1 min-h-0 px-6">
          {viewTestRunDetail && (
            <p className="text-sm text-muted-foreground mt-2">
              Execution time:{" "}
              {viewTestRunDetail.startedAt ? new Date(viewTestRunDetail.startedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
              {" – "}
              {viewTestRunDetail.completedAt ? new Date(viewTestRunDetail.completedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
              {viewTestRunDetail.startedAt && viewTestRunDetail.completedAt && (
                <span className="tabular-nums">
                  {" "}({Math.round((new Date(viewTestRunDetail.completedAt).getTime() - new Date(viewTestRunDetail.startedAt).getTime()) / 1000)}s)
                </span>
              )}
            </p>
          )}
          <div className="flex-1 overflow-auto mt-4 space-y-4 min-h-0">
            {!viewTestRunDetail ? (
              <p className="text-sm text-muted-foreground py-4">Loading run…</p>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                      <div className="text-lg font-semibold tabular-nums">{viewTestRunDetail.executions?.length ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                      <div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
                        {viewTestRunDetail.executions?.filter((e) => e.status === "PASSED").length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Passed</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-center">
                      <div className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                        {viewTestRunDetail.executions?.filter((e) => e.status === "FAILED").length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Executions</h4>
                  {!viewTestRunDetail.executions?.length ? (
                    <p className="text-sm text-muted-foreground py-4">No executions in this run.</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {(() => {
                          const total = viewTestRunDetail.executions.length;
                          const totalPages = Math.ceil(total / runDetailLimit) || 1;
                          const page = Math.max(1, Math.min(runDetailPage, totalPages));
                          const start = (page - 1) * runDetailLimit;
                          const slice = viewTestRunDetail.executions.slice(start, start + runDetailLimit);
                          return slice.map((e, i) => {
                            const tcNum = start + i + 1;
                            const title = e.testCaseTitle || "—";
                            const startStr = e.startedAt ? new Date(e.startedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
                            const endStr = e.finishedAt ? new Date(e.finishedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
                            const durationStr = e.duration != null ? `${e.duration}s` : "—";
                            return (
                              <div
                                key={e.id}
                                className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="shrink-0 font-medium text-muted-foreground">TC {tcNum}</span>
                                  <span
                                    className="font-medium truncate min-w-0"
                                    title={title}
                                  >
                                    {title}
                                  </span>
                                  <Badge variant={executionStatusBadgeVariant(getExecutionDisplayStatus(e.status, e.execution_status))} className="text-xs shrink-0 ml-auto">{getExecutionDisplayStatus(e.status, e.execution_status)}</Badge>
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                  Execution time: {startStr} – {endStr} ({durationStr})
                                </p>
                              </div>
                            );
                          });
                        })()}
                      </div>
                      {viewTestRunDetail.executions.length > runDetailLimit && (() => {
                        const total = viewTestRunDetail.executions.length;
                        const totalPages = Math.ceil(total / runDetailLimit) || 1;
                        const page = Math.max(1, Math.min(runDetailPage, totalPages));
                        return (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border mt-3">
                            <span className="text-xs text-muted-foreground">
                              Page {page} of {totalPages} ({total} executions)
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRunDetailPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                              >
                                Previous
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setRunDetailPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={appDrawerOpen} onOpenChange={setAppDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle className="mb-0">Add application</SheetTitle>
              <div className="flex gap-2 shrink-0">
                <Button type="submit" form="app-form" disabled={appSubmitting} size="sm">
                  {appSubmitting ? "Creating…" : "Create application"}
                </Button>
              </div>
            </div>
            <SheetDescription>Name and code are required. Platform drives test type options.</SheetDescription>
          </SheetHeader>
          <form id="app-form" onSubmit={createApplication} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Name</label>
                  <Input value={appForm.name} onChange={(e) => setAppForm((p) => ({ ...p, name: e.target.value }))} placeholder="Application name" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Code</label>
                  <Input value={appForm.code} onChange={(e) => setAppForm((p) => ({ ...p, code: e.target.value }))} placeholder="Unique code (e.g. WEB-STG)" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Description</label>
                  <textarea value={appForm.description} onChange={(e) => setAppForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Platform</label>
                  <select
                    value={appForm.platform}
                    onChange={(e) => {
                      const platformName = e.target.value;
                      const plat = platformListWithTypes.find((p) => p.name === platformName);
                      setAppForm((p) => ({
                        ...p,
                        platform: platformName,
                        testTypes: plat && plat.testTypes.length > 0 ? [...plat.testTypes] : ["API", "E2E"],
                      }));
                    }}
                    className={selectClass}
                  >
                    <option value="">— Select platform —</option>
                    {platformListWithTypes.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {appForm.platform && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Test type</label>
                    <p className="text-xs text-muted-foreground">Shown according to selected platform.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {appForm.testTypes.length > 0 &&
                        appForm.testTypes.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-md bg-elevated px-2 py-0.5 text-xs font-medium"
                          >
                            {t}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
                {appError && <p className="text-sm text-destructive">{appError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewApplication} onOpenChange={(open) => { if (!open) { setViewApplication(null); setViewAppForm(null); setViewAppError(""); } }}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle className="mb-0">Application</SheetTitle>
              {viewAppForm && userRole !== "qa" && (
                <Button type="submit" form="view-app-form" disabled={viewAppSaving} size="sm">
                  {viewAppSaving ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
            <SheetDescription>{viewApplication?.name ?? "View / edit"}</SheetDescription>
          </SheetHeader>
          {viewAppForm && (
            <form id="view-app-form" onSubmit={saveViewApplication} className="flex min-h-0 flex-1 flex-col">
              <SheetBody>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Name</label>
                    <Input value={viewAppForm.name} onChange={(e) => setViewAppForm((p) => p ? { ...p, name: e.target.value } : p)} placeholder="Name" required disabled={userRole === "qa"} />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Code</label>
                    <Input value={viewAppForm.code} onChange={(e) => setViewAppForm((p) => p ? { ...p, code: e.target.value } : p)} placeholder="Code" required />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Description</label>
                    <textarea value={viewAppForm.description} onChange={(e) => setViewAppForm((p) => p ? { ...p, description: e.target.value } : p)} placeholder="Optional" rows={2} disabled={userRole === "qa"} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">{viewAppForm.enabled ? "Enabled" : "Disabled"}</label>
                    <Switch checked={viewAppForm.enabled} onCheckedChange={(checked) => setViewAppForm((p) => p ? { ...p, enabled: checked } : p)} disabled={userRole === "qa"} />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Platform</label>
                    <select
                      value={viewAppForm.platform}
                      onChange={(e) => {
                        const platformName = e.target.value;
                        const plat = platformListWithTypes.find((p) => p.name === platformName);
                        setViewAppForm((p) =>
                          p
                            ? { ...p, platform: platformName, testTypes: plat && plat.testTypes.length > 0 ? [...plat.testTypes] : ["API", "E2E"] }
                            : p
                        );
                      }}
                      disabled={userRole === "qa"}
                      className={selectClass}
                    >
                      <option value="">— Select platform —</option>
                      {platformListWithTypes.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {viewAppForm.platform && (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Test type</label>
                      <p className="text-xs text-muted-foreground">Shown according to selected platform.</p>
                      <div className="flex flex-wrap gap-1.5">
                        {viewAppForm.testTypes.length > 0 &&
                          viewAppForm.testTypes.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded-md bg-elevated px-2 py-0.5 text-xs font-medium"
                            >
                              {t}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {viewAppError && <p className="text-sm text-destructive">{viewAppError}</p>}
                </div>
              </SheetBody>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!appConfirmDeleteId} onOpenChange={(open) => { if (!open) { setAppConfirmDeleteId(null); setAppDeleteError(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete application</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {appDeleteError && <p className="text-sm text-destructive">{appDeleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAppConfirmDeleteId(null); setAppDeleteError(""); }}>Cancel</Button>
            <Button variant="danger" disabled={appDeleting} onClick={() => appConfirmDeleteId && deleteApplication(appConfirmDeleteId)}>
              {appDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={dkDrawerOpen} onOpenChange={(open) => { if (!open) closeDkModal(); }}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle className="mb-0">{dkEditingId ? "Edit Data Knowledge" : "Add Data Knowledge"}</SheetTitle>
              <div className="flex gap-2 shrink-0">
                {dkEditingId && (
                  <Button type="button" variant="secondary" size="sm" onClick={closeDkModal}>
                    Cancel
                  </Button>
                )}
                <Button type="submit" form="dk-form" disabled={dkSubmitting} size="sm">
                  {dkSubmitting ? "Saving…" : dkEditingId ? "Update" : "Create"}
                </Button>
              </div>
            </div>
            <SheetDescription>Define a structured test input entry. Key must be unique per project. Type, scenario, and role must be uppercase.</SheetDescription>
          </SheetHeader>
          <form id="dk-form" onSubmit={submitDkForm} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                {dkFormError && <p className="text-sm text-destructive">{dkFormError}</p>}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Key <span className="text-destructive">*</span></label>
                  <Input
                    value={dkForm.key}
                    onChange={(e) => setDkForm((p) => ({ ...p, key: e.target.value }))}
                    placeholder="e.g. USER_VALID_ADMIN"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Type <span className="text-destructive">*</span></label>
                  <Input
                    value={dkForm.type}
                    onChange={(e) => setDkForm((p) => ({ ...p, type: e.target.value.toUpperCase() }))}
                    placeholder="e.g. USER"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Scenario <span className="text-destructive">*</span></label>
                  <Input
                    value={dkForm.scenario}
                    onChange={(e) => setDkForm((p) => ({ ...p, scenario: e.target.value.toUpperCase() }))}
                    placeholder="e.g. VALID, INVALID, EDGE, EMPTY"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Role (optional)</label>
                  <Input
                    value={dkForm.role}
                    onChange={(e) => setDkForm((p) => ({ ...p, role: e.target.value }))}
                    placeholder="e.g. ADMIN or leave empty"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Source</label>
                  <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
                    {dkEditingId ? (dkForm.source ?? "FIXED") : "USER_INPUT"}
                  </div>
                  <p className="text-xs text-muted-foreground">Set by system: USER_INPUT (user add), AI_SIMULATION (AI), FIXED (AI-created then user edited Value).</p>
                </div>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="dk-verified"
                      checked={dkForm.verified}
                      onCheckedChange={(v) => setDkForm((p) => ({ ...p, verified: v }))}
                    />
                    <label htmlFor="dk-verified" className="text-sm font-medium text-muted-foreground shrink-0">
                      {dkForm.verified ? "Verified" : "Not verified"}
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="dk-previously-passed"
                      checked={dkForm.previously_passed}
                      onCheckedChange={(v) => setDkForm((p) => ({ ...p, previously_passed: v }))}
                    />
                    <label htmlFor="dk-previously-passed" className="text-sm font-medium text-muted-foreground shrink-0">
                      {dkForm.previously_passed ? "Previously passed" : "No previous passes"}
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Value <span className="text-destructive">*</span> (JSON)</label>
                  <textarea
                    value={dkForm.value}
                    onChange={(e) => setDkForm((p) => ({ ...p, value: e.target.value }))}
                    placeholder='{"email":"a@b.com","password":"..."}'
                    rows={6}
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={!!dkConfirmDeleteId} onOpenChange={(open) => { if (!open) setDkConfirmDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete data knowledge</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDkConfirmDeleteId(null)}>Cancel</Button>
            <Button variant="danger" disabled={dkDeleting} onClick={() => dkConfirmDeleteId && deleteDataKnowledge(dkConfirmDeleteId)}>
              {dkDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={envDrawerOpen} onOpenChange={setEnvDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle className="mb-0">Add environment</SheetTitle>
              <div className="flex gap-2 shrink-0">
                <Button type="submit" form="env-form" disabled={envSubmitting} size="sm">
                  {envSubmitting ? "Creating…" : "Create environment"}
                </Button>
              </div>
            </div>
            <SheetDescription>Name and base URL are required. Select Type and enter credentials accordingly.</SheetDescription>
          </SheetHeader>
          <form id="env-form" onSubmit={createEnvironment} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Name</label>
                  <Input
                    value={envForm.name}
                    onChange={(e) => setEnvForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Staging"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Base URL</label>
                  <Input
                    type="url"
                    value={envForm.baseUrl}
                    onChange={(e) => setEnvForm((p) => ({ ...p, baseUrl: e.target.value }))}
                    placeholder="https://staging.example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Application</label>
                  <select
                    value={envForm.applicationId}
                    onChange={(e) => {
                      const appId = e.target.value;
                      const app = envApplicationOptions.find((a) => a.id === appId);
                      const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes : ["E2E", "API"];
                      const newType = (types.includes(envForm.type) ? envForm.type : types[0]) as "API" | "E2E";
                      setEnvForm((p) => ({ ...p, applicationId: appId, type: newType }));
                    }}
                    className={selectClass}
                  >
                    <option value="">— Select application —</option>
                    {envApplicationOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Type</label>
                  <select
                    value={envForm.type}
                    onChange={(e) => setEnvForm((p) => ({ ...p, type: e.target.value as "API" | "E2E" }))}
                    className={selectClass}
                  >
                    {(() => {
                      const app = envForm.applicationId ? envApplicationOptions.find((a) => a.id === envForm.applicationId) : null;
                      const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes : ["E2E", "API"];
                      return types.map((t) => <option key={t} value={t}>{t}</option>);
                    })()}
                  </select>
                </div>
                {envForm.type === "API" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">API auth mode</label>
                    <select
                      value={envForm.apiAuthMode}
                      onChange={(e) => setEnvForm((p) => ({ ...p, apiAuthMode: e.target.value as "NONE" | "BASIC_AUTH" | "BEARER_TOKEN" }))}
                      className={selectClass}
                    >
                      <option value="NONE">NONE</option>
                      <option value="BASIC_AUTH">BASIC_AUTH</option>
                      <option value="BEARER_TOKEN">BEARER_TOKEN</option>
                    </select>
                  </div>
                )}
                {envForm.type === "E2E" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">E2E auth mode</label>
                    <select
                      value={envForm.e2eAuthMode}
                      onChange={(e) => setEnvForm((p) => ({ ...p, e2eAuthMode: e.target.value as "ALWAYS_AUTH" | "NEVER_AUTH" | "CONDITIONAL" }))}
                      className={selectClass}
                    >
                      <option value="ALWAYS_AUTH">ALWAYS_AUTH</option>
                      <option value="NEVER_AUTH">NEVER_AUTH</option>
                      <option value="CONDITIONAL">CONDITIONAL</option>
                    </select>
                  </div>
                )}
                {envForm.type === "API" && envForm.apiAuthMode === "BASIC_AUTH" && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">App Key</label>
                      <Input
                        type="password"
                        value={envForm.appKey}
                        onChange={(e) => setEnvForm((p) => ({ ...p, appKey: e.target.value }))}
                        placeholder="App Key"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Secret Key</label>
                      <Input
                        type="password"
                        value={envForm.secretKey}
                        onChange={(e) => setEnvForm((p) => ({ ...p, secretKey: e.target.value }))}
                        placeholder="Secret Key"
                        autoComplete="off"
                      />
                    </div>
                  </>
                )}
                {envForm.type === "API" && envForm.apiAuthMode === "BEARER_TOKEN" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-muted-foreground">Token</label>
                    <Input
                      type="password"
                      value={envForm.apiToken}
                      onChange={(e) => setEnvForm((p) => ({ ...p, apiToken: e.target.value }))}
                      placeholder="Bearer token"
                      autoComplete="off"
                    />
                  </div>
                )}
                {envForm.type === "E2E" && (envForm.e2eAuthMode === "ALWAYS_AUTH" || envForm.e2eAuthMode === "CONDITIONAL") && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-muted-foreground">Username / Password<br /><span className="font-normal">(multiple roles, leave blank to keep for password)</span></label>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setEnvForm((p) => ({ ...p, credentials: [...p.credentials, { role: "", username: "", password: "" }] }))}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      {envForm.credentials.map((cred, idx) => (
                        <div key={idx} className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[80px] space-y-1">
                            <label className="text-xs text-muted-foreground">Role (optional)</label>
                            <Input
                              value={cred.role}
                              onChange={(e) =>
                                setEnvForm((p) => ({
                                  ...p,
                                  credentials: p.credentials.map((c, i) => (i === idx ? { ...c, role: e.target.value } : c)),
                                }))
                              }
                              placeholder="e.g. admin"
                              className="text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[100px] space-y-1">
                            <label className="text-xs text-muted-foreground">Username</label>
                            <Input
                              value={cred.username}
                              onChange={(e) =>
                                setEnvForm((p) => ({
                                  ...p,
                                  credentials: p.credentials.map((c, i) => (i === idx ? { ...c, username: e.target.value } : c)),
                                }))
                              }
                              placeholder="Username"
                              className="text-sm"
                            />
                          </div>
                          <div className="flex-1 min-w-[100px] space-y-1">
                            <label className="text-xs text-muted-foreground">Password</label>
                            <Input
                              type="password"
                              value={cred.password}
                              onChange={(e) =>
                                setEnvForm((p) => ({
                                  ...p,
                                  credentials: p.credentials.map((c, i) => (i === idx ? { ...c, password: e.target.value } : c)),
                                }))
                              }
                              placeholder="Password"
                              className="text-sm"
                              autoComplete="off"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              setEnvForm((p) => ({
                                ...p,
                                credentials: p.credentials.filter((_, i) => i !== idx),
                              }))
                            }
                            disabled={envForm.credentials.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {envError && <p className="text-sm text-destructive">{envError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewEnvironment} onOpenChange={(open) => { if (!open) { setViewEnvironment(null); setViewEnvForm(null); setViewEnvError(""); } }}>
        <SheetContent side="right">
          {viewEnvironment && viewEnvForm && (
            <>
              <SheetHeader>
                <div className="flex flex-row items-center justify-between gap-4">
                  <SheetTitle className="mb-0">Environment</SheetTitle>
                  {userRole !== "qa" && (
                    <Button type="submit" form="view-env-form" disabled={viewEnvSaving} size="sm">
                      {viewEnvSaving ? "Saving…" : "Save"}
                    </Button>
                  )}
                </div>
                <SheetDescription>Edit environment details</SheetDescription>
              </SheetHeader>
              <form id="view-env-form" onSubmit={saveViewEnvironment} className="flex min-h-0 flex-1 flex-col">
                <SheetBody>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Name</label>
                      <Input
                        value={viewEnvForm.name}
                        onChange={(e) => setViewEnvForm((p) => p ? { ...p, name: e.target.value } : p)}
                        placeholder="e.g. Staging"
                        required
                        disabled={userRole === "qa"}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Base URL</label>
                      <Input
                        type="url"
                        value={viewEnvForm.baseUrl}
                        onChange={(e) => setViewEnvForm((p) => p ? { ...p, baseUrl: e.target.value } : p)}
                        placeholder="https://staging.example.com"
                        required
                        disabled={userRole === "qa"}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Application</label>
                      <select
                        value={viewEnvForm.applicationId}
                        onChange={(e) => {
                          const appId = e.target.value;
                          const app = envApplicationOptions.find((a) => a.id === appId);
                          const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes as string[] : ["API", "E2E"];
                          const newType = types.includes(viewEnvForm!.type) ? viewEnvForm!.type : (types[0] as "API" | "E2E");
                          setViewEnvForm((p) => p ? { ...p, applicationId: appId, type: newType } : p);
                        }}
                        disabled={userRole === "qa"}
                        className={selectClass}
                      >
                        <option value="">— Select application —</option>
                        {envApplicationOptions.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={viewEnvForm.isActive}
                        disabled={userRole === "qa"}
                        onCheckedChange={(checked) => setViewEnvForm((p) => p ? { ...p, isActive: checked } : p)}
                      />
                      <span className="text-sm text-muted-foreground">{viewEnvForm.isActive ? "Active" : "Inactive"}</span>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Type</label>
                      <select
                        value={viewEnvForm.type}
                        onChange={(e) => setViewEnvForm((p) => p ? { ...p, type: e.target.value as "API" | "E2E" } : p)}
                        disabled={userRole === "qa"}
                        className={selectClass}
                      >
                        {(() => {
                          const app = viewEnvForm.applicationId ? envApplicationOptions.find((a) => a.id === viewEnvForm.applicationId) : null;
                          const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes as string[] : ["E2E", "API"];
                          return types.map((t) => <option key={t} value={t}>{t}</option>);
                        })()}
                      </select>
                    </div>
                    {viewEnvForm.type === "API" && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">API auth mode</label>
                        <select
                          value={viewEnvForm.apiAuthMode}
                          onChange={(e) => setViewEnvForm((p) => p ? { ...p, apiAuthMode: e.target.value } : p)}
                          disabled={userRole === "qa"}
                          className={selectClass}
                        >
                          <option value="NONE">NONE</option>
                          <option value="BASIC_AUTH">BASIC_AUTH</option>
                          <option value="BEARER_TOKEN">BEARER_TOKEN</option>
                        </select>
                      </div>
                    )}
                    {viewEnvForm.type === "E2E" && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">E2E auth mode</label>
                        <select
                          value={viewEnvForm.e2eAuthMode}
                          onChange={(e) => setViewEnvForm((p) => p ? { ...p, e2eAuthMode: e.target.value } : p)}
                          disabled={userRole === "qa"}
                          className={selectClass}
                        >
                          <option value="ALWAYS_AUTH">ALWAYS_AUTH</option>
                          <option value="NEVER_AUTH">NEVER_AUTH</option>
                          <option value="CONDITIONAL">CONDITIONAL</option>
                        </select>
                      </div>
                    )}
                    {viewEnvForm.type === "API" && viewEnvForm.apiAuthMode === "BASIC_AUTH" && (
                      <>
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-muted-foreground">App Key (leave blank to keep)</label>
                          <Input
                            type="password"
                            value={viewEnvForm.appKey}
                            onChange={(e) => setViewEnvForm((p) => p ? { ...p, appKey: e.target.value } : p)}
                            placeholder="App Key"
                            autoComplete="off"
                            disabled={userRole === "qa"}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-muted-foreground">Secret Key (leave blank to keep)</label>
                          <Input
                            type="password"
                            value={viewEnvForm.secretKey}
                            onChange={(e) => setViewEnvForm((p) => p ? { ...p, secretKey: e.target.value } : p)}
                            placeholder="Secret Key"
                            autoComplete="off"
                            disabled={userRole === "qa"}
                          />
                        </div>
                      </>
                    )}
                    {viewEnvForm.type === "API" && viewEnvForm.apiAuthMode === "BEARER_TOKEN" && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Token (leave blank to keep)</label>
                        <Input
                          type="password"
                          value={viewEnvForm.apiToken}
                          onChange={(e) => setViewEnvForm((p) => p ? { ...p, apiToken: e.target.value } : p)}
                          placeholder="Bearer token"
                          autoComplete="off"
                          disabled={userRole === "qa"}
                        />
                      </div>
                    )}
                    {viewEnvForm.type === "E2E" && (viewEnvForm.e2eAuthMode === "ALWAYS_AUTH" || viewEnvForm.e2eAuthMode === "CONDITIONAL") && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-muted-foreground">Username / Password<br /><span className="font-normal">(multiple roles, leave blank to keep for password)</span></label>
                          {userRole !== "qa" && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setViewEnvForm((p) => p ? { ...p, credentials: [...p.credentials, { role: "", username: "", password: "" }] } : p)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <div className="space-y-3 rounded-lg border border-border p-3">
                          {viewEnvForm.credentials.map((cred, idx) => (
                            <div key={idx} className="flex flex-wrap items-end gap-2">
                              <div className="flex-1 min-w-[80px] space-y-1">
                                <label className="text-xs text-muted-foreground">Role (optional)</label>
                                <Input
                                  value={cred.role}
                                  onChange={(e) =>
                                    setViewEnvForm((p) =>
                                      p ? { ...p, credentials: p.credentials.map((c, i) => (i === idx ? { ...c, role: e.target.value } : c)) } : p
                                    )
                                  }
                                  placeholder="e.g. admin"
                                  className="text-sm"
                                  disabled={userRole === "qa"}
                                />
                              </div>
                              <div className="flex-1 min-w-[100px] space-y-1">
                                <label className="text-xs text-muted-foreground">Username</label>
                                <Input
                                  value={cred.username}
                                  onChange={(e) =>
                                    setViewEnvForm((p) =>
                                      p ? { ...p, credentials: p.credentials.map((c, i) => (i === idx ? { ...c, username: e.target.value } : c)) } : p
                                    )
                                  }
                                  placeholder="Username"
                                  className="text-sm"
                                  disabled={userRole === "qa"}
                                />
                              </div>
                              <div className="flex-1 min-w-[100px] space-y-1">
                                <label className="text-xs text-muted-foreground">Password</label>
                                <Input
                                  type="password"
                                  value={cred.password}
                                  onChange={(e) =>
                                    setViewEnvForm((p) =>
                                      p ? { ...p, credentials: p.credentials.map((c, i) => (i === idx ? { ...c, password: e.target.value } : c)) } : p
                                    )
                                  }
                                  placeholder="Password"
                                  className="text-sm"
                                  autoComplete="off"
                                  disabled={userRole === "qa"}
                                />
                              </div>
                              {userRole !== "qa" && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    setViewEnvForm((p) => (p ? { ...p, credentials: p.credentials.filter((_, i) => i !== idx) } : p))
                                  }
                                  disabled={viewEnvForm.credentials.length <= 1}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {viewEnvError && <p className="text-sm text-destructive">{viewEnvError}</p>}
                  </div>
                </SheetBody>
              </form>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!envConfirmDeleteId} onOpenChange={(open) => !open && setEnvConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete environment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this environment? This cannot be undone.
            </DialogDescription>
            {envDeleteError && <p className="text-sm text-destructive">{envDeleteError}</p>}
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEnvConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => envConfirmDeleteId && deleteEnvironment(envConfirmDeleteId)}
              disabled={envDeleting}
            >
              {envDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!viewTicket} onOpenChange={(open) => !open && setViewTicket(null)}>
        <SheetContent side="right">
          {viewTicket && (
            <>
              <SheetHeader>
                <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <SheetTitle className="mb-0">
                    Ticket {viewTicket._count != null ? `(${viewTicket._count.testCases ?? 0})` : ""}
                  </SheetTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        viewTicket.status === "DONE"
                          ? "success"
                          : viewTicket.status === "CANCEL"
                            ? "queued"
                            : viewTicket.status === "READY_TO_TEST"
                              ? "running"
                              : "default"
                      }
                      className={
                        viewTicket.status === "DRAFT"
                          ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                          : viewTicket.status === "READY_TO_TEST"
                            ? "bg-blue-600/15 text-blue-400 border-blue-500/30"
                            : undefined
                      }
                    >
                      {viewTicket.status.replace(/_/g, " ")}
                    </Badge>
                    {viewTicket.status === "DRAFT" && viewTicketEditForm && (
                      <Button
                        type="submit"
                        form="view-ticket-edit-form"
                        size="sm"
                        disabled={viewTicketSaving}
                      >
                        {viewTicketSaving ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-foreground mt-1">{viewTicket.title}</p>
              </SheetHeader>
              <SheetBody>
                {viewTicket.status === "DRAFT" && viewTicketEditForm ? (
                  <form id="view-ticket-edit-form" onSubmit={saveViewTicket} className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Title</label>
                      <Input
                        value={viewTicketEditForm.title}
                        onChange={(e) => setViewTicketEditForm((p) => (p ? { ...p, title: e.target.value } : null))}
                        placeholder="e.g. User login flow"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Description (optional)</label>
                      <textarea
                        value={viewTicketEditForm.description}
                        onChange={(e) => setViewTicketEditForm((p) => (p ? { ...p, description: e.target.value } : null))}
                        placeholder="General description..."
                        rows={6}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Acceptance criteria (optional)</label>
                      <textarea
                        value={viewTicketEditForm.acceptanceCriteria}
                        onChange={(e) => setViewTicketEditForm((p) => (p ? { ...p, acceptanceCriteria: e.target.value } : null))}
                        placeholder="Used for generating test cases..."
                        rows={6}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Priority (optional)</label>
                      <select
                        value={viewTicketEditForm.priority}
                        onChange={(e) => setViewTicketEditForm((p) => (p ? { ...p, priority: e.target.value } : null))}
                        className={selectClass}
                      >
                        <option value="">— None —</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">External ID (optional)</label>
                      <Input
                        value={viewTicketEditForm.externalId}
                        onChange={(e) => setViewTicketEditForm((p) => (p ? { ...p, externalId: e.target.value } : null))}
                        placeholder="e.g. PROJ-123"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-muted-foreground">Applications (optional)</label>
                      {ticketApplicationOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No applications in this project. Add at Applications tab.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {viewTicketEditForm.applicationIds.length > 0 &&
                            viewTicketEditForm.applicationIds.map((appId) => {
                              const app = ticketApplicationOptions.find((a) => a.id === appId);
                              return (
                                <span
                                  key={appId}
                                  className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-xs font-medium"
                                >
                                  {app ? `${app.name} (${app.code})` : appId}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewTicketEditForm((p) => (p ? { ...p, applicationIds: p.applicationIds.filter((x) => x !== appId) } : null))
                                    }
                                    className="rounded hover:bg-background p-0.5"
                                    aria-label={`Remove ${app?.name ?? appId}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                          {ticketApplicationOptions
                            .filter((a) => !viewTicketEditForm.applicationIds.includes(a.id))
                            .map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() =>
                                  setViewTicketEditForm((p) => (p ? { ...p, applicationIds: [...p.applicationIds, a.id] } : null))
                                }
                                className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-elevated"
                              >
                                + {a.name} ({a.code})
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 text-sm">
                    {Array.isArray(viewTicket.applicationIds) && viewTicket.applicationIds.length > 0 && (
                      <div>
                        <span className="font-medium text-muted-foreground">Applications</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {viewTicket.applicationIds.map((appId) => {
                            const app = ticketApplicationOptions.find((a) => a.id === appId);
                            return (
                              <Badge key={appId} variant="default">
                                {app ? `${app.name} (${app.code})` : appId}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {viewTicket.description && (
                      <div>
                        <span className="font-medium text-muted-foreground">Description</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-foreground">{viewTicket.description}</p>
                      </div>
                    )}
                    {viewTicket.acceptanceCriteria && (
                      <div>
                        <span className="font-medium text-muted-foreground">Acceptance criteria</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-foreground">{viewTicket.acceptanceCriteria}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <dt className="text-xs text-muted-foreground font-medium">Priority</dt>
                        <dd className="mt-0.5 text-foreground">{viewTicket.priority ?? "—"}</dd>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <dt className="text-xs text-muted-foreground font-medium">External ID</dt>
                        <dd className="mt-0.5 text-foreground">{viewTicket.externalId ?? "—"}</dd>
                      </div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                        <dt className="text-xs text-muted-foreground font-medium">Updated</dt>
                        <dd className="mt-0.5 text-foreground">
                          {viewTicket.updatedAt
                            ? new Date(viewTicket.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </dd>
                      </div>
                    </div>
                  </div>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!ticketConfirmAction} onOpenChange={(open) => !open && setTicketConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ticketConfirmAction?.status === "READY_TO_TEST" && "Set ticket to Ready"}
              {ticketConfirmAction?.status === "DONE" && "Mark ticket as Done"}
              {ticketConfirmAction?.status === "CANCEL" && "Cancel ticket"}
            </DialogTitle>
            <DialogDescription>
              {ticketConfirmAction?.status === "READY_TO_TEST" && "Are you sure you want to set this ticket to Ready to test?"}
              {ticketConfirmAction?.status === "DONE" && "Are you sure you want to mark this ticket as Done?"}
              {ticketConfirmAction?.status === "CANCEL" && "Are you sure you want to cancel this ticket?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTicketConfirmAction(null)}>
              No
            </Button>
            <Button
              type="button"
              variant={ticketConfirmAction?.status === "CANCEL" ? "danger" : "secondary"}
              onClick={() => {
                if (ticketConfirmAction) {
                  updateTicketStatus(ticketConfirmAction.ticketId, ticketConfirmAction.status);
                  setTicketConfirmAction(null);
                }
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={ticketDrawerOpen} onOpenChange={setTicketDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle>Add ticket</SheetTitle>
              <div className="flex gap-2 shrink-0">
                <Button type="submit" form="ticket-form" disabled={ticketSubmitting} size="sm">
                  {ticketSubmitting ? "Creating…" : "Create ticket"}
                </Button>
              </div>
            </div>
            <SheetDescription>Ticket is the source for creating test cases. Title is required. Status starts as DRAFT; use Ready / Done / Cancel in the table to change it.</SheetDescription>
          </SheetHeader>
          <form id="ticket-form" onSubmit={createTicket} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Title</label>
                  <Input
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. User login flow"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Description (optional)</label>
                  <textarea
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="General description..."
                    rows={10}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Acceptance criteria (optional)</label>
                  <textarea
                    value={ticketForm.acceptanceCriteria}
                    onChange={(e) => setTicketForm((p) => ({ ...p, acceptanceCriteria: e.target.value }))}
                    placeholder="Used for generating test cases..."
                    rows={10}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Applications (optional)</label>
                  {ticketApplicationOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No applications in this project. Add at Applications tab.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ticketForm.applicationIds.length > 0 &&
                        ticketForm.applicationIds.map((appId) => {
                          const app = ticketApplicationOptions.find((a) => a.id === appId);
                          return (
                            <span
                              key={appId}
                              className="inline-flex items-center gap-1 rounded-md bg-elevated px-2 py-0.5 text-xs font-medium"
                            >
                              {app ? `${app.name} (${app.code})` : appId}
                              <button
                                type="button"
                                onClick={() =>
                                  setTicketForm((p) => ({ ...p, applicationIds: p.applicationIds.filter((x) => x !== appId) }))
                                }
                                className="rounded hover:bg-background p-0.5"
                                aria-label={`Remove ${app?.name ?? appId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      {ticketApplicationOptions
                        .filter((a) => !ticketForm.applicationIds.includes(a.id))
                        .map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() =>
                              setTicketForm((p) => ({ ...p, applicationIds: [...p.applicationIds, a.id] }))
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-elevated"
                          >
                            + {a.name} ({a.code})
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">External ID (e.g. Jira key)</label>
                  <Input
                    value={ticketForm.externalId}
                    onChange={(e) => setTicketForm((p) => ({ ...p, externalId: e.target.value }))}
                    placeholder="e.g. PROJ-123"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Priority (optional)</label>
                  <select
                    value={ticketForm.priority}
                    onChange={(e) => setTicketForm((p) => ({ ...p, priority: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">— None —</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                {ticketError && <p className="text-sm text-destructive">{ticketError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <div className="flex flex-row items-start justify-between gap-4">
              <div>
                <SheetTitle>Import tickets</SheetTitle>
                <SheetDescription>
                  Upload a CSV or JSON file to import tickets (all will have status DRAFT). CSV must have a title column; use applicationids column with ; to separate multiple application IDs.
                </SheetDescription>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button type="button" variant="secondary" size="sm" onClick={() => setImportDialogOpen(false)}>
                  Close
                </Button>
                <Button type="button" size="sm" onClick={handleImportSubmit} disabled={!importFile || importSubmitting}>
                  {importSubmitting ? "Importing…" : "Import"}
                </Button>
              </div>
            </div>
          </SheetHeader>
          <SheetBody className="flex-1 min-h-0 pt-4">
            <div className="space-y-4">
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.json,text/csv,application/json"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
              />
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setImportDragOver(true);
                }}
                onDragLeave={() => setImportDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setImportDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f && (f.name.endsWith(".csv") || f.name.endsWith(".json"))) handleImportFile(f);
                  else setImportError("Only .csv or .json files are supported");
                }}
                onClick={() => importInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && importInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
                  importDragOver ? "border-accent bg-accent/10" : "border-border bg-elevated/30 hover:bg-elevated/50"
                }`}
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
<p className="text-sm font-medium text-foreground">Click to select a file or drag and drop here</p>
              <p className="text-xs text-muted-foreground mt-1">CSV or JSON</p>
                {importFile && (
                  <p className="text-sm text-foreground mt-2 font-mono">{importFile.name}</p>
                )}
              </div>
              {importError && <p className="text-sm text-destructive">{importError}</p>}
              {importResult != null && <p className="text-sm text-success">Imported {importResult} tickets successfully</p>}
            </div>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={tcDrawerOpen} onOpenChange={setTcDrawerOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <div className="flex flex-row items-center justify-between gap-4">
              <SheetTitle className="mb-0">Add test case</SheetTitle>
              <Button type="submit" form="tc-form" disabled={tcSubmitting} size="sm">
                {tcSubmitting ? "Creating…" : "Create test case"}
              </Button>
            </div>
            <SheetDescription>Title is required. Application comes from the ticket; test type is limited to that application.</SheetDescription>
          </SheetHeader>
          <form id="tc-form" onSubmit={createTestCase} className="flex min-h-0 flex-1 flex-col">
            <SheetBody>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Project</label>
                  <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {tcForm.ticketId ? (project?.name ?? "—") : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Filled automatically when a ticket is selected.</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Title</label>
                  <Input
                    value={tcForm.title}
                    onChange={(e) => setTcForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. User can log in with valid credentials"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Ticket</label>
                  <select
                    value={tcForm.ticketId}
                    onChange={(e) => {
                      const ticketId = e.target.value;
                      const ticket = tickets.find((t) => t.id === ticketId);
                      const ticketAppIds = ticket && Array.isArray(ticket.applicationIds) ? ticket.applicationIds : [];
                      const ticketApps = ticketApplicationOptions.filter((a) => ticketAppIds.includes(a.id));
                      const firstApp = ticketApps[0];
                      const appTestTypes = firstApp && Array.isArray(firstApp.testTypes) && firstApp.testTypes.length > 0 ? firstApp.testTypes as string[] : ["E2E", "API"];
                      setTcForm((p) => ({
                        ...p,
                        ticketId,
                        applicationId: firstApp?.id ?? "",
                        testType: appTestTypes.includes(p.testType) ? p.testType : (appTestTypes[0] as "API" | "E2E"),
                      }));
                    }}
                    className={selectClass}
                  >
                    <option value="">— Select ticket —</option>
                    {tickets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Application</label>
                  <select
                    value={tcForm.applicationId}
                    onChange={(e) => {
                      const applicationId = e.target.value;
                      const app = ticketApplicationOptions.find((a) => a.id === applicationId);
                      const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes as string[] : ["E2E", "API"];
                      setTcForm((p) => ({
                        ...p,
                        applicationId,
                        testType: types.includes(p.testType) ? p.testType : (types[0] as "API" | "E2E"),
                      }));
                    }}
                    className={selectClass}
                    disabled={!tcForm.ticketId}
                  >
                    <option value="">— Select application —</option>
                    {(() => {
                      const ticket = tcForm.ticketId ? tickets.find((t) => t.id === tcForm.ticketId) : null;
                      const ticketAppIds = ticket && Array.isArray(ticket.applicationIds) ? ticket.applicationIds : [];
                      const ticketApps = ticketApplicationOptions.filter((a) => ticketAppIds.includes(a.id));
                      return ticketApps.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.code ? ` (${a.code})` : ""}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Test type</label>
                  <select
                    value={tcForm.testType}
                    onChange={(e) => setTcForm((p) => ({ ...p, testType: e.target.value as "API" | "E2E" }))}
                    className={selectClass}
                  >
                    {(() => {
                      const app = tcForm.applicationId ? ticketApplicationOptions.find((a) => a.id === tcForm.applicationId) : null;
                      const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes as string[] : ["E2E", "API"];
                      return types.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Priority</label>
                  <select
                    value={tcForm.priority}
                    onChange={(e) => setTcForm((p) => ({ ...p, priority: e.target.value as typeof tcForm.priority }))}
                    className={selectClass}
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-muted-foreground">Test steps</label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setTcForm((p) => ({ ...p, testSteps: [...p.testSteps, ""] }))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(tcForm.testSteps.length === 0 ? [""] : tcForm.testSteps).map((step, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={() => setTcDragStepIndex(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (tcDragStepIndex === null || tcDragStepIndex === idx) return;
                          setTcForm((p) => {
                            const steps = [...(p.testSteps.length ? p.testSteps : [""])];
                            const [removed] = steps.splice(tcDragStepIndex, 1);
                            steps.splice(idx, 0, removed);
                            return { ...p, testSteps: steps };
                          });
                          setTcDragStepIndex(null);
                        }}
                        onDragEnd={() => setTcDragStepIndex(null)}
                        className={`flex gap-2 rounded-lg border border-border bg-elevated/30 p-2 ${tcDragStepIndex === idx ? "opacity-70" : ""}`}
                      >
                        <span className="cursor-grab touch-none self-center text-muted-foreground active:cursor-grabbing" aria-hidden>
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <textarea
                          value={step}
                          onChange={(e) => {
                            const steps = [...(tcForm.testSteps.length ? tcForm.testSteps : [""])];
                            steps[idx] = e.target.value;
                            setTcForm((p) => ({ ...p, testSteps: steps }));
                          }}
                          placeholder={`Step ${idx + 1}`}
                          rows={2}
                          className="min-h-[4rem] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const steps = (tcForm.testSteps.length ? tcForm.testSteps : [""]).filter((_, i) => i !== idx);
                            setTcForm((p) => ({ ...p, testSteps: steps.length ? steps : [""] }));
                          }}
                          disabled={(tcForm.testSteps.length || 1) <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Expected result</label>
                  <textarea
                    value={tcForm.expectedResult}
                    onChange={(e) => setTcForm((p) => ({ ...p, expectedResult: e.target.value }))}
                    placeholder="Describe the expected outcome"
                    rows={3}
                    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Category</label>
                  <select
                    value={tcForm.category}
                    onChange={(e) => setTcForm((p) => ({ ...p, category: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">—</option>
                    {TC_CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Data condition</label>
                  <select
                    value={tcForm.data_condition}
                    onChange={(e) => setTcForm((p) => ({ ...p, data_condition: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">—</option>
                    {TC_DATA_CONDITION_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-muted-foreground">Setup hint</label>
                  <textarea
                    value={tcForm.setup_hint}
                    onChange={(e) => setTcForm((p) => ({ ...p, setup_hint: e.target.value }))}
                    placeholder="Optional setup or data dependency hint"
                    rows={2}
                    className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                {tcError && <p className="text-sm text-destructive">{tcError}</p>}
              </div>
            </SheetBody>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!viewTestCase} onOpenChange={(open) => { if (!open) { setViewTestCase(null); setViewTcForm(null); setViewTcError(""); setViewTcDragStepIndex(null); setViewTcLinkedTicket(null); } }}>
        <SheetContent side="right" className="flex flex-col">
          {viewTestCase && (
            <>
              <SheetHeader>
                <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <SheetTitle className="mb-0">Test case</SheetTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        viewTestCase.status === "PASSED"
                          ? "success"
                          : viewTestCase.status === "FAILED"
                            ? "destructive"
                            : viewTestCase.status === "READY" || viewTestCase.status === "TESTING"
                              ? "running"
                              : viewTestCase.status === "IGNORE" || viewTestCase.status === "CANCEL"
                                ? "queued"
                                : "default"
                      }
                      className={
                        viewTestCase.status === "DRAFT"
                          ? "bg-slate-500/15 text-slate-400 border-slate-500/30"
                          : viewTestCase.status === "READY"
                            ? "bg-blue-600/15 text-blue-400 border-blue-500/30"
                            : viewTestCase.status === "TESTING"
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : undefined
                      }
                    >
                      {viewTestCase.status}
                    </Badge>
                    {viewTestCase.status === "DRAFT" && viewTcForm && (
                      <Button type="submit" form="view-tc-form" disabled={viewTcSaving} size="sm">
                        {viewTcSaving ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-foreground mt-1">{viewTestCase.title}</p>
              </SheetHeader>
              {viewTestCase.status === "DRAFT" && viewTcForm ? (
                <form id="view-tc-form" onSubmit={saveViewTestCase} className="flex min-h-0 flex-1 flex-col">
                  <SheetBody>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Project</label>
                        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">{project?.name ?? "—"}</p>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Title</label>
                        <Input value={viewTcForm.title} onChange={(e) => setViewTcForm((p) => p ? { ...p, title: e.target.value } : p)} placeholder="Title" required />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Ticket</label>
                        <select value={viewTcForm.ticketId} onChange={(e) => setViewTcForm((p) => p ? { ...p, ticketId: e.target.value } : p)} className={selectClass} disabled>
                          <option value="">— Select ticket —</option>
                          {(viewTcLinkedTicket && viewTcForm.ticketId === viewTcLinkedTicket.id && !tickets.some((t) => t.id === viewTcLinkedTicket.id)
                            ? [viewTcLinkedTicket, ...tickets]
                            : tickets
                          ).map((t) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Application</label>
                        <select value={viewTcForm.applicationId} onChange={() => {}} className={selectClass} disabled>
                          <option value="">—</option>
                          {(() => {
                            const ticket = viewTcForm.ticketId
                              ? tickets.find((t) => t.id === viewTcForm!.ticketId) ?? (viewTcLinkedTicket && viewTcForm.ticketId === viewTcLinkedTicket.id ? viewTcLinkedTicket : null)
                              : null;
                            const ticketAppIds = ticket && Array.isArray(ticket.applicationIds) ? ticket.applicationIds : [];
                            const ticketApps = ticketApplicationOptions.filter((a) => ticketAppIds.includes(a.id));
                            return ticketApps.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}{a.code ? ` (${a.code})` : ""}</option>
                            ));
                          })()}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Test type</label>
                        <select value={viewTcForm.testType} onChange={(e) => setViewTcForm((p) => p ? { ...p, testType: e.target.value } : p)} className={selectClass}>
                          {(() => {
                            const app = viewTcForm.applicationId ? ticketApplicationOptions.find((a) => a.id === viewTcForm!.applicationId) : null;
                            const types = app && Array.isArray(app.testTypes) && app.testTypes.length > 0 ? app.testTypes as string[] : ["E2E", "API"];
                            return types.map((t) => <option key={t} value={t}>{t}</option>);
                          })()}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Priority</label>
                        <select value={viewTcForm.priority} onChange={(e) => setViewTcForm((p) => p ? { ...p, priority: e.target.value } : p)} className={selectClass}>
                          <option value="CRITICAL">Critical</option>
                          <option value="HIGH">High</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="LOW">Low</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-muted-foreground">Test steps</label>
                          <Button type="button" variant="secondary" size="sm" className="h-8 w-8 p-0" onClick={() => setViewTcForm((p) => p ? { ...p, testSteps: [...p.testSteps, ""] } : p)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {(viewTcForm.testSteps.length === 0 ? [""] : viewTcForm.testSteps).map((step, idx) => (
                            <div
                              key={idx}
                              draggable
                              onDragStart={() => setViewTcDragStepIndex(idx)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (viewTcDragStepIndex === null || viewTcDragStepIndex === idx) return;
                                setViewTcForm((p) => {
                                  if (!p) return p;
                                  const steps = [...(p.testSteps.length ? p.testSteps : [""])];
                                  const [removed] = steps.splice(viewTcDragStepIndex, 1);
                                  steps.splice(idx, 0, removed);
                                  return { ...p, testSteps: steps };
                                });
                                setViewTcDragStepIndex(null);
                              }}
                              onDragEnd={() => setViewTcDragStepIndex(null)}
                              className={`flex gap-2 rounded-lg border border-border bg-elevated/30 p-2 ${viewTcDragStepIndex === idx ? "opacity-70" : ""}`}
                            >
                              <span className="cursor-grab touch-none self-center text-muted-foreground active:cursor-grabbing" aria-hidden>
                                <GripVertical className="h-4 w-4" />
                              </span>
                              <textarea
                                value={step}
                                onChange={(e) => setViewTcForm((p) => { if (!p) return p; const s = [...(p.testSteps.length ? p.testSteps : [""])]; s[idx] = e.target.value; return { ...p, testSteps: s }; })}
                                placeholder={`Step ${idx + 1}`}
                                rows={2}
                                className="min-h-[4rem] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => { const steps = (viewTcForm.testSteps.length ? viewTcForm.testSteps : [""]).filter((_, i) => i !== idx); setViewTcForm((p) => p ? { ...p, testSteps: steps.length ? steps : [""] } : p); }}
                                disabled={(viewTcForm.testSteps.length || 1) <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Expected result</label>
                        <textarea value={viewTcForm.expectedResult} onChange={(e) => setViewTcForm((p) => p ? { ...p, expectedResult: e.target.value } : p)} placeholder="Describe the expected outcome" rows={3} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Category</label>
                        <select value={viewTcForm.category} onChange={(e) => setViewTcForm((p) => p ? { ...p, category: e.target.value } : p)} className={selectClass}>
                          <option value="">—</option>
                          {TC_CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Data condition</label>
                        <select value={viewTcForm.data_condition} onChange={(e) => setViewTcForm((p) => p ? { ...p, data_condition: e.target.value } : p)} className={selectClass}>
                          <option value="">—</option>
                          {TC_DATA_CONDITION_OPTIONS.map((d) => (
                            <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-muted-foreground">Setup hint</label>
                        <textarea value={viewTcForm.setup_hint} onChange={(e) => setViewTcForm((p) => p ? { ...p, setup_hint: e.target.value } : p)} placeholder="Optional setup or data dependency hint" rows={2} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                      </div>
                      {viewTcError && <p className="text-sm text-destructive">{viewTcError}</p>}
                    </div>
                  </SheetBody>
                </form>
              ) : (
                <SheetBody>
                  <dl className="space-y-4 text-sm">
                    <div><dt className="text-muted-foreground font-medium">Project</dt><dd className="mt-0.5 text-foreground">{project?.name ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground font-medium">Ticket</dt><dd className="mt-0.5 text-foreground">{viewTcLinkedTicket ? viewTcLinkedTicket.title : "—"}</dd></div>
                    <div><dt className="text-muted-foreground font-medium">Application</dt><dd className="mt-0.5 text-foreground">{viewTestCase.application ? `${viewTestCase.application.name}${viewTestCase.application.code ? ` (${viewTestCase.application.code})` : ""}` : "—"}</dd></div>
                    {viewTestCase.status === "IGNORE" && viewTestCase.ignoreReason && (
                      <div><dt className="text-muted-foreground font-medium">Ignore reason</dt><dd className="mt-0.5 text-amber-600 dark:text-amber-400 whitespace-pre-wrap">{viewTestCase.ignoreReason}</dd></div>
                    )}
                    <div>
                      <dt className="text-muted-foreground font-medium">Steps</dt>
                      <dd className="mt-0.5">
                        {Array.isArray(viewTestCase.testSteps) && viewTestCase.testSteps.length > 0 ? (
                          <ol className="list-decimal list-inside space-y-2 text-foreground">
                            {viewTestCase.testSteps.map((step, i) => (
                              <li key={i} className="whitespace-pre-wrap pl-1">{step}</li>
                            ))}
                          </ol>
                        ) : (
                          <span className="text-muted-foreground">{viewTestCase.testSteps?.length ?? 0} steps</span>
                        )}
                      </dd>
                    </div>
                    <div><dt className="text-muted-foreground font-medium">Expected result</dt><dd className="mt-0.5 text-foreground whitespace-pre-wrap">{viewTestCase.expectedResult ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground font-medium">Setup hint</dt><dd className="mt-0.5 text-foreground whitespace-pre-wrap">{viewTestCase.setup_hint ?? "—"}</dd></div>
                    <div className="space-y-2 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <dt className="text-xs text-muted-foreground font-medium">Test type</dt>
                          <dd className="mt-0.5 text-foreground">{viewTestCase.testType ?? "—"}</dd>
                        </div>
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <dt className="text-xs text-muted-foreground font-medium">Data condition</dt>
                          <dd className="mt-0.5 text-foreground">{viewTestCase.data_condition ?? "—"}</dd>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <dt className="text-xs text-muted-foreground font-medium">Priority</dt>
                          <dd className="mt-0.5 text-foreground">{viewTestCase.priority}</dd>
                        </div>
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <dt className="text-xs text-muted-foreground font-medium">Category</dt>
                          <dd className="mt-0.5 text-foreground">{viewTestCase.category ?? "—"}</dd>
                        </div>
                        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                          <dt className="text-xs text-muted-foreground font-medium">Source</dt>
                          <dd className="mt-0.5 text-foreground">{viewTestCase.source}</dd>
                        </div>
                      </div>
                    </div>
                  </dl>
                </SheetBody>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!tcConfirmAction} onOpenChange={(open) => !open && setTcConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tcConfirmAction?.status === "READY" && "Set test case to Ready"}
              {tcConfirmAction?.status === "CANCEL" && "Cancel test case"}
            </DialogTitle>
            <DialogDescription>
              {tcConfirmAction?.status === "READY" && "Are you sure you want to set this test case to Ready?"}
              {tcConfirmAction?.status === "CANCEL" && "Are you sure you want to cancel this test case?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setTcConfirmAction(null)}>No</Button>
            <Button type="button" variant={tcConfirmAction?.status === "CANCEL" ? "danger" : "secondary"} onClick={() => { if (tcConfirmAction) { updateTestCaseStatus(tcConfirmAction.tcId, tcConfirmAction.status); setTcConfirmAction(null); } }}>Yes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tcHistoryTestCase} onOpenChange={(open) => { if (!open) { setTcHistoryTestCase(null); setTcHistoryExecutionIds([]); setTcHistoryIndex(0); setTcHistoryExecution(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Execution history</DialogTitle>
            <DialogDescription>{tcHistoryTestCase?.title ?? "—"}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 min-h-0 overflow-auto flex-1">
            {tcHistoryLoading && !tcHistoryExecution ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : tcHistoryExecutionIds.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No executions yet for this test case.</p>
            ) : tcHistoryExecution ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    Execution {tcHistoryIndex + 1} of {tcHistoryExecutionIds.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTcHistoryIndex((i) => Math.max(0, i - 1))}
                      disabled={tcHistoryIndex <= 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setTcHistoryIndex((i) => Math.min(tcHistoryExecutionIds.length - 1, i + 1))}
                      disabled={tcHistoryIndex >= tcHistoryExecutionIds.length - 1}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge variant={executionStatusBadgeVariant(getExecutionDisplayStatus(tcHistoryExecution.status, tcHistoryExecution.executionMetadata?.execution_status))}>{getExecutionDisplayStatus(tcHistoryExecution.status, tcHistoryExecution.executionMetadata?.execution_status)}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Duration</span>
                      <span className="text-foreground tabular-nums">{tcHistoryExecution.duration != null ? `${tcHistoryExecution.duration}ms` : "—"}</span>
                    </div>
                    {tcHistoryExecution.startedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Started</span>
                        <span>{new Date(tcHistoryExecution.startedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    )}
                    {tcHistoryExecution.finishedAt && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Finished</span>
                        <span>{new Date(tcHistoryExecution.finishedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                      </div>
                    )}
                    {tcHistoryExecution.resultSummary && (
                      <div className="pt-2 border-t border-border">
                        <span className="text-sm text-muted-foreground">Result</span>
                        <p className="mt-1 text-foreground text-sm">{tcHistoryExecution.resultSummary}</p>
                      </div>
                    )}
                    {tcHistoryExecution.errorMessage && (
                      <p className="text-sm text-destructive">{tcHistoryExecution.errorMessage}</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Recording</p>
                    <VideoPreview src={tcHistoryExecution.videoUrl} className="w-full aspect-video rounded-lg" />
                  </div>
                </div>
                {tcHistoryExecution.executionMetadata && (tcHistoryExecution.executionMetadata.base_url || (tcHistoryExecution.executionMetadata.test_data && Object.keys(tcHistoryExecution.executionMetadata.test_data).length > 0)) && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Test data used</p>
                    {tcHistoryExecution.executionMetadata.base_url && (
                      <p className="text-sm font-mono break-all">{tcHistoryExecution.executionMetadata.base_url}</p>
                    )}
                    {tcHistoryExecution.executionMetadata.test_data && Object.keys(tcHistoryExecution.executionMetadata.test_data).length > 0 && (
                      <dl className="mt-2 grid gap-1.5 sm:grid-cols-2 text-sm">
                        {Object.entries(tcHistoryExecution.executionMetadata.test_data).map(([k, v]) =>
                          v != null && v !== "" ? (
                            <div key={k} className="rounded border border-border bg-muted/20 px-2 py-1.5">
                              <dt className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                              <dd className="font-mono">{v}</dd>
                            </div>
                          ) : null
                        )}
                      </dl>
                    )}
                  </div>
                )}
                {tcHistoryExecution.readableSteps && tcHistoryExecution.readableSteps.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Readable steps</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-sm">
                      {tcHistoryExecution.readableSteps.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {tcHistoryExecution.stepLog && tcHistoryExecution.stepLog.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Step log</p>
                    <ul className="space-y-2">
                      {tcHistoryExecution.stepLog.map((step) => (
                        <li key={step.order} className="flex items-start gap-3 rounded-lg border border-border bg-elevated/50 p-3 text-sm">
                          <Badge variant={step.passed ? "success" : "destructive"} className="shrink-0">{step.order}</Badge>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground">{step.action}</span>
                            {(step.failure_type ?? step.error) && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {step.failure_type && (
                                  <span className="inline-block rounded px-1.5 py-0.5 bg-muted/50 font-medium mr-1">
                                    {step.failure_type.replace(/_/g, " ")}
                                  </span>
                                )}
                                {(step.error_message ?? step.error) && (
                                  <span className="text-destructive break-words">{step.error_message ?? step.error}</span>
                                )}
                              </p>
                            )}
                            {"screenshotUrl" in step && step.screenshotUrl && (
                              <div className="mt-2 space-y-1">
                                <a href={step.screenshotUrl as string} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">View image</a>
                                <img src={step.screenshotUrl as string} alt={`Step ${step.order}`} className="rounded border border-border max-h-48 object-contain block" />
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tcHistoryExecution.screenshotUrls && Array.isArray(tcHistoryExecution.screenshotUrls) && tcHistoryExecution.screenshotUrls.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Screenshots</p>
                    <div className="flex flex-wrap gap-2">
                      {(tcHistoryExecution.screenshotUrls as string[]).map((url, idx) => (
                        <div key={idx} className="space-y-1">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">View image</a>
                          <img src={url} alt={`Screenshot ${idx + 1}`} className="rounded border border-border max-h-48 object-contain block" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
