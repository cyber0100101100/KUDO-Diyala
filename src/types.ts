/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
  displayName: string;
  email: string;
  role: 'employee' | 'manager' | 'admin' | 'supervisor';
  employeeId: string;
  profileImageUrl?: string;
  enrollmentComplete: boolean;
  faceBiometricRef?: string;
  faceEmbedding?: number[];
  baseSalary?: number;
  bonus?: number;
  advance?: number;
  deduction?: number;
  overtime?: number;
  jobTitle?: string;
  groupId?: string;
  groupStatus?: 'none' | 'pending' | 'joined';
  status?: 'present' | 'late' | 'absent';
  lateMinutes?: number;
  shiftStart?: string; // HH:mm format
  graceMinutes?: number;
  verificationCode?: string;
  isVerified?: boolean;
  cycleStartDate?: string; // ISO date when the 30-day cycle started
  workDaysCount?: number; // Current day in the 30-day cycle (1-30)
  lateCount?: number; // Number of times late in current 30-day cycle
  joinedAt?: any; // Date when user joined the group
}

export interface Schedule {
  id?: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: 'scheduled' | 'completed' | 'missed';
  createdAt: any;
  notificationsSent?: {
    scheduled?: boolean;
    halfHour?: boolean;
    tenMin?: boolean;
    fiveMin?: boolean;
    start?: boolean;
    tenMinLate?: boolean;
    twentyMinLate?: boolean;
  };
}

export interface Group {
  id?: string;
  name: string;
  imageUrl?: string;
  managerId: string;
  createdAt: any;
  employeeCount: number;
}

export interface Attendance {
  id?: string;
  userId: string;
  date: string; // YYYY-MM-DD
  checkInTime: string; // ISO
  checkOutTime?: string; // ISO
  status: 'present' | 'late' | 'absent';
  locationVerified: boolean;
  checkInLocation?: { lat: number; lng: number };
  checkOutLocation?: { lat: number; lng: number };
  scheduleId?: string;
}

export interface LeaveRequest {
  id?: string;
  userId: string;
  type: 'leave' | 'advance' | 'automated_deduction' | 'group_join' | 'absence_deduction' | 'bonus' | 'deduction' | 'overtime';
  amount?: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'forwarded_to_admin';
  createdAt: string; // ISO
  lateOccurrences?: number;
  groupName?: string;
  groupId?: string;
  startDate?: string;
  endDate?: string;
  daysCount?: number;
  requesterId?: string;
  date?: string;
}

export interface Notification {
  id?: string;
  userId: string | null; // null means global announcement
  title: string;
  message: string;
  type: 'announcement' | 'attendance' | 'salary' | 'request' | 'chat';
  createdAt: any;
  isRead: boolean;
  metadata?: {
    chatId?: string;
    [key: string]: any;
  };
}

export interface ChatMessage {
  id?: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  receiverId?: string;
  text?: string;
  imageUrl?: string;
  type?: 'text' | 'image';
  timestamp: any;
  read?: boolean;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  participantNames?: { [userId: string]: string };
  lastMessage?: string;
  lastUpdate?: any;
  lastSenderId?: string;
  unreadCount?: { [userId: string]: number };
  isGroup?: boolean;
  name?: string;
}

export interface ActivityLog {
  id?: string;
  userId: string;
  type: 'location_update' | 'check_in' | 'check_out';
  timestamp: any;
  latitude: number;
  longitude: number;
  address?: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id?: string;
  orderNumber: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  createdAt: any;
  type: 'dine-in' | 'takeaway' | 'delivery';
  tableNumber?: string;
}
