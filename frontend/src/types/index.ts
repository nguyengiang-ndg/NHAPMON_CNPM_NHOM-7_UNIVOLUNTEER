export type UserRole = 'STUDENT' | 'MANAGER' | 'ADMIN';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'LOCKED';

export interface User {
  id: number;
  email: string;
  role: UserRole;
  status: UserStatus;
  full_name: string;
  dob: string | null;
  phone: string;
  student_code: string | null;
  address: string | null;
  avatar_url: string | null;
  reject_reason?: string | null;
  created_at: string;
}

export interface Activity {
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
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCEL_REQUESTED' | 'CANCELLED';
  reject_reason?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  manager_name?: string;
  manager_phone?: string;
  manager_email?: string;
  approved_count?: number;
  pending_count?: number;
  waitlist_count?: number;
  cancel_requested_count?: number;
  proof_pending_count?: number;
  proof_confirmed_count?: number;
  available_slots?: number;
  is_ended?: boolean;
  is_upcoming?: boolean;
  is_registration_open?: boolean;
  is_waitlist_open?: boolean;
}

export interface WaitlistItem {
  waitlist_id: number;
  activity_id: number;
  note_to_manager: string | null;
  waitlist_status: 'WAITING' | 'NOTIFIED' | 'PROMOTED' | 'CANCELLED';
  notified_at: string | null;
  created_at: string;
  title: string;
  location: string;
  cover_image: string;
  start_time: string;
  end_time: string;
  registration_deadline: string;
  training_points: number;
  max_participants: number;
  activity_status: string;
  manager_name: string;
  manager_phone: string;
  approved_count: number;
  available_slots: number;
  waitlist_count: number;
  queue_position: number;
}

export interface ScheduleItem {
  registration_id: number;
  registration_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCEL_REQUESTED' | 'CANCELLED';
  note_to_manager: string | null;
  cancel_reason: string | null;
  reject_reason: string | null;
  registered_at: string;
  activity_id: number;
  title: string;
  description: string;
  cover_image: string;
  location: string;
  start_time: string;
  end_time: string;
  training_points: number;
  max_participants: number;
  activity_status: string;
  manager_name: string;
  manager_phone: string;
  checked_in_at?: string | null;
  checkin_method?: 'PIN' | 'QR' | 'MANUAL' | null;
  has_active_checkin_session?: number | boolean;
}

export interface EndedActivityForStudent {
  registration_id: number;
  activity_id: number;
  title: string;
  location: string;
  cover_image: string;
  start_time: string;
  end_time: string;
  training_points: number;
  manager_name: string;
  manager_phone: string;
  checked_in_at?: string | null;
  checkin_method?: 'PIN' | 'QR' | 'MANUAL' | null;
  is_checked_in?: boolean;
  can_submit_proof?: boolean;
  proof_id: number | null;
  proof_image_url: string | null;
  proof_description: string | null;
  proof_status: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | null;
  proof_reject_reason: string | null;
  proof_submitted_at: string | null;
  remaining_ms: number;
  expires_at: string;
}

export interface AttendanceSessionInfo {
  id: number;
  activity_id: number;
  mode: 'STATIC' | 'ROTATING';
  rotate_seconds: number;
  is_active: boolean;
  opened_at: string;
  expires_at: string;
  closed_at: string | null;
  current_pin: string;
  next_rotate_at: string | null;
  seconds_until_rotate: number | null;
  server_time: string;
  is_expired: boolean;
}

export interface AttendanceStudentRecord {
  registration_id: number;
  registration_status: string;
  student_id: number;
  full_name: string;
  student_code: string;
  phone: string;
  attendance_id: number | null;
  checkin_method: 'PIN' | 'QR' | 'MANUAL' | null;
  checked_in_at: string | null;
  proof_status: string | null;
}

export interface PointHistoryItem {
  id: number;
  activity_id: number;
  points: number;
  semester: string;
  awarded_at: string;
  activity_title: string;
  activity_location: string;
  activity_start_time?: string;
  activity_end_time?: string;
  manager_name?: string;
  manager_phone?: string;
  proof_image_url?: string | null;
  proof_description?: string | null;
  proof_status?: string | null;
}

export interface AppNotification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  is_read: number;
  created_at: string;
}

export interface ReportItem {
  id: number;
  reporter_id: number;
  sender_role: 'STUDENT' | 'MANAGER';
  target_type: 'ACTIVITY' | 'USER' | 'PROOF' | 'OTHER';
  target_id: number | null;
  title: string;
  content: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  reporter_name?: string;
  reporter_email?: string;
  reporter_phone?: string;
  reporter_student_code?: string | null;
}

export interface DashboardStats {
  totalStudents: number;
  activeManagers: number;
  pendingManagers: number;
  approvedActivities: number;
  pendingActivities: number;
  cancelRequestedActivities: number;
  openReports: number;
  totalPointsAwarded: number;
}
