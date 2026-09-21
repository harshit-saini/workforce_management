export type Role = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
export type UserStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE";
// Organization-defined (Jira-like custom statuses) — see TaskStatusOption / Settings page.
export type TaskStatus = string;
export type StatusCategory = "BACKLOG" | "ACTIVE" | "DONE" | "BLOCKED";

export interface TaskStatusOption {
  id: string;
  key: string;
  label: string;
  category: StatusCategory;
  color: string;
  order: number;
  isDefault: boolean;
  isRecurringDefault: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  centerId: string | null;
  departmentId: string | null;
  managerId: string | null;
  title: string | null;
  expiresAt: string;
  createdAt: string;
}
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ReportStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED";
export type NotificationType =
  | "TASK_DUE_SOON"
  | "TASK_OVERDUE"
  | "NO_TIME_LOGGED"
  | "WEEKLY_REPORT_DUE"
  | "MONTHLY_REPORT_PENDING"
  | "TASK_ASSIGNED"
  | "COMMENT_MENTION"
  | "MANUAL_NUDGE";

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  centerId: string | null;
  departmentId: string | null;
  title?: string | null;
  status?: UserStatus;
  managerId?: string | null;
  isCenterHead?: boolean;
  center?: { id: string; name: string; code: string } | null;
  department?: { id: string; name: string } | null;
  manager?: { id: string; name: string; email: string } | null;
  startDate?: string | null;
  createdAt?: string;
}

export interface Center {
  id: string;
  name: string;
  code: string;
  address: string | null;
  timezone: string;
  isActive: boolean;
}

export interface Department {
  id: string;
  name: string;
  headUserId: string | null;
  head?: { id: string; name: string } | null;
  _count?: { members: number };
}

export interface TaskTag {
  id: string;
  label: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  isRecurring: boolean;
  assigneeId: string | null;
  assignee?: { id: string; name: string; avatarUrl: string | null } | null;
  createdById: string;
  createdBy?: { id: string; name: string };
  centerId: string | null;
  center?: { id: string; name: string; code: string } | null;
  departmentId: string | null;
  department?: { id: string; name: string } | null;
  parentTaskId: string | null;
  parentTask?: { id: string; title: string; status: TaskStatus } | null;
  subtasks?: { id: string; title: string; status: TaskStatus; assigneeId: string | null; dueDate: string | null }[];
  dueDate: string | null;
  estimatedHours: number | null;
  blockedReason: string | null;
  tags: TaskTag[];
  watchers?: { userId: string; user: { id: string; name: string } }[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  attachments?: TaskAttachment[];
  _count?: { comments: number; attachments: number };
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  user: { id: string; name: string; avatarUrl?: string | null };
  comment: string;
  statusChangedTo: TaskStatus | null;
  createdAt: string;
  attachments?: TaskAttachment[];
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  commentId: string | null;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  userId: string;
  user: { id: string; name: string };
  type: string;
  message: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  relatedTaskId: string | null;
  relatedReportId: string | null;
  createdAt: string;
}

export interface OverviewResult {
  range: { startDate: string; endDate: string };
  tasksCreated: number;
  tasksCompleted: number;
  tasksOpen: number;
  tasksBlocked: number;
  hoursLoggedTotal: number;
  hoursByDay: { date: string; hours: number }[];
  subtaskCompletion: { total: number; done: number };
  activityTimeline: {
    id: string;
    taskId: string;
    taskTitle: string;
    userId: string;
    userName: string;
    type: string;
    message: string;
    createdAt: string;
  }[];
  completedByDay: { date: string; count: number }[];
}

export interface WeeklyReport {
  id: string;
  userId: string;
  weekStartDate: string;
  weekEndDate: string;
  tasksCompleted: number;
  tasksCarriedOver: number;
  tasksBlocked: number;
  hoursLogged: number;
  daysLogged: number;
  summary: string | null;
  status: ReportStatus;
  managerComment: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface MonthlyReport {
  id: string;
  userId: string;
  month: number;
  year: number;
  tasksPlanned: number;
  tasksCompleted: number;
  completionRate: number;
  hoursLogged: number;
  daysLogged: number;
  hoursExpected: number;
  weeklyBreakdownJson: { weekStartDate: string; tasksCompleted: number; hoursLogged: number }[] | null;
  topBlockersJson: { word: string; count: number }[] | null;
  generatedAt: string;
}

export interface HierarchyNode {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  role: Role;
  managerId: string | null;
  centerId: string | null;
  departmentId: string | null;
  status: UserStatus;
  reports: HierarchyNode[];
}

export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}
