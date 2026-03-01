# การใช้ API Key กับ N8N หรือ Integration อื่น

หลังจาก Add API Key ในหน้า Config → API Keys แล้ว ให้ใช้ **secret key** (ที่ระบบแสดงครั้งเดียวตอนสร้าง) เป็น **Bearer token** เมื่อเรียก API ของแพลตฟอร์มนี้

## วิธีตั้งค่า

1. **สร้าง API Key**: ใน Config → API Keys กด "Add" ตั้งชื่อ (เช่น `N8N`) แล้ว copy ค่า key ที่แสดง **เก็บไว้ให้ดี เพราะจะไม่แสดงอีก**
2. **ส่งใน Header**: ทุก request ต้องมี header  
   `Authorization: Bearer <your-api-key>`

## ตัวอย่าง cURL – สร้าง Ticket

แทนที่:
- `YOUR_BASE_URL` = URL ของแพลตฟอร์ม (เช่น `https://qa.yourcompany.com`)
- `YOUR_API_KEY` = secret key ที่ copy ไว้ตอนสร้าง
- ระบุโปรเจกต์แบบใดแบบหนึ่ง:
  - `projectId` = CUID ของโปรเจกต์ (ดูจาก URL หน้า project หรือจาก GET /api/projects)
  - `projectKey` = Jira project key ของโปรเจกต์ (เช่น `PROJ`, `QA` — ต้องตั้งค่าในโปรเจกต์ก่อน)

```bash
# ใช้ projectId (CUID)
curl -X POST "YOUR_BASE_URL/api/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "projectId": "PROJECT_ID",
    "title": "หัวข้อ ticket จาก N8N",
    "description": "รายละเอียด (ถ้ามี)",
    "acceptanceCriteria": "เกณฑ์การยอมรับ (ถ้ามี)",
    "externalId": "ID จากระบบภายนอก (ถ้ามี)",
    "priority": "HIGH"
  }'

# หรือใช้ projectKey (Jira project key)
curl -X POST "YOUR_BASE_URL/api/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "projectKey": "PROJ",
    "title": "หัวข้อ ticket จาก N8N",
    "description": "รายละเอียด (ถ้ามี)"
  }'
```

ตัวอย่างค่าจริง (ใช้ projectId หรือ projectKey อย่างใดอย่างหนึ่ง):

```bash
# ใช้ projectId
curl -X POST "https://qa.example.com/api/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_xxxxxxxxxxxxxxxx" \
  -d '{
    "projectId": "clxx1234567890abcdef",
    "title": "Login ต้อง validate email",
    "description": "เมื่อกรอก email ไม่ถูกต้อง ต้องแสดง error"
  }'

# ใช้ Jira project key
curl -X POST "https://qa.example.com/api/tickets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_xxxxxxxxxxxxxxxx" \
  -d '{
    "projectKey": "QA",
    "title": "Login ต้อง validate email",
    "description": "เมื่อกรอก email ไม่ถูกต้อง ต้องแสดง error"
  }'
```

## ตั้งค่าใน N8N

1. ใน Workflow ที่จะเรียก API นี้ ใช้ node **HTTP Request** (หรือเทียบเท่า)
2. **Method**: POST (สำหรับสร้าง ticket)
3. **URL**: `https://<your-platform>/api/tickets`
4. **Authentication**: เลือก "Header Auth" หรือ "Generic Credential Type"
   - **Name**: `Authorization`
   - **Value**: `Bearer <paste-your-api-key>`
5. **Body** (JSON): ใส่ `projectId`, `title` และ field อื่นตามต้องการ

ถ้า N8N รองรับ "Bearer Token" auth type ให้เลือกแบบนั้น แล้วใส่เฉพาะค่า key (ไม่ต้องพิมพ์คำว่า "Bearer" เอง)

## Endpoints ที่ใช้ API Key ได้

API key มีสิทธิเทียบเท่า role **manager** จึงเรียกได้เช่น:

- `POST /api/tickets` – สร้าง ticket
- `GET /api/tickets?projectId=...` – ดึงรายการ tickets
- `POST /api/tickets/import` – import หลาย tickets พร้อมกัน

และ endpoints อื่นที่ role manager เข้าถึงได้
