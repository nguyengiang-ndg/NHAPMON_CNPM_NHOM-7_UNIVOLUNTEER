export type UserRole = 'STUDENT' | 'MANAGER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'LOCKED';

export type ActivityStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

export type RegistrationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

export type WaitlistStatus = 'WAITING' | 'NOTIFIED' | 'PROMOTED' | 'CANCELLED';

export type AttendanceSessionMode = 'STATIC' | 'ROTATING';
export type CheckInMethod = 'PIN' | 'QR' | 'MANUAL';

export type ProofStatus = 'SUBMITTED' | 'CONFIRMED' | 'REJECTED';
export type ReportStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type ReportTargetType = 'ACTIVITY' | 'USER' | 'PROOF' | 'OTHER';

export interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  full_name: string;
  dob: string | null;
  phone: string;
  student_code: string | null;
  address: string | null;
  avatar_url: string | null;
  reject_reason: string | null;
  created_at: string;
}

export interface ActivityRecord {
  id: number;
  manager_id: number;
  title: string;
  description: string;
  cover_image: string;
  location: string;
  start_time: string;
  end_time: string;
  registration_deadline: string;
  max_participants: number;
  training_points: number;
  status: ActivityStatus;
  reject_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface RegistrationRecord {
  id: number;
  activity_id: number;
  student_id: number;
  note_to_manager: string | null;
  status: RegistrationStatus;
  cancel_reason: string | null;
  reject_reason: string | null;
  registered_at: string;
  updated_at: string;
}

export interface ActivityWaitlistRecord {
  id: number;
  activity_id: number;
  student_id: number;
  note_to_manager: string | null;
  status: WaitlistStatus;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSessionRecord {
  id: number;
  activity_id: number;
  manager_id: number;
  mode: AttendanceSessionMode;
  pin_code: string | null;
  secret: string;
  rotate_seconds: number;
  is_active: number;
  opened_at: string;
  expires_at: string;
  closed_at: string | null;
}

export interface AttendanceRecord {
  id: number;
  activity_id: number;
  registration_id: number;
  student_id: number;
  session_id: number | null;
  method: CheckInMethod;
  checked_in_at: string;
  checked_in_by: number | null;
}

export interface ProofSubmissionRecord {
  id: number;
  registration_id: number;
  image_url: string;
  description: string | null;
  status: ProofStatus;
  reject_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface PointHistoryRecord {
  id: number;
  student_id: number;
  activity_id: number;
  registration_id: number;
  points: number;
  semester: string;
  awarded_at: string;
}

export interface ReportRecord {
  id: number;
  reporter_id: number;
  sender_role: 'STUDENT' | 'MANAGER';
  target_type: ReportTargetType;
  target_id: number | null;
  title: string;
  content: string;
  status: ReportStatus;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationRecord {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  is_read: number;
  created_at: string;
}

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
