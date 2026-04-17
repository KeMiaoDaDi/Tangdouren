import type { TableType, PartySizeCategory } from './config'

export type { TableType, PartySizeCategory }

export type BookingMode    = 'private_full_table' | 'shared_partial_table'
export type SeatGroupType  =
  | 'single_on_single'
  | 'single_on_double_shared'
  | 'double_on_double'
  | 'double_on_four_shared'
  | 'group_on_four'
export type BookingStatus =
  | 'payment_pending'     // 已锁位，等待支付（有超时）
  | 'payment_failed'      // 支付失败，占位释放
  | 'expired'             // 支付超时，占位自动释放
  | 'confirmed'           // 支付成功，预约确认
  | 'completed'           // 体验完成
  | 'cancelled'           // 已取消
  | 'refund_pending'      // 退款已发起，等待处理
  | 'refunded'            // 全额退款完成
  | 'partially_refunded'  // 部分退款完成（预留）

// 服务层使用的桌位定义（来自 config 或 DB）
export interface TableDef {
  tableCode: string
  tableType: TableType
  capacity:  number
  isActive:  boolean
  tableId?:  string  // DB uuid（可选）
}

// 已有预约记录（服务层使用，来自 DB 行映射）
export interface ExistingBooking {
  bookingId:          string
  bookingDate:        string
  startTime:          string   // "HH:MM"
  endTime:            string
  bufferedEndTime:    string
  partySize:          number
  acceptsSharing:     boolean
  assignedTableId:    string
  assignedTableCode:  string
  assignedTableType:  TableType
  bookingMode:        BookingMode
  seatGroupType:      SeatGroupType
  status:             BookingStatus
}

// 前端可选的预约选项（每个按钮）
export interface AvailabilityOption {
  durationMinutes: number
  isSharedOption:  boolean
  displayTag:      string       // 后端直接生成的展示文字
  tableType:       TableType    // 内部用于分配
}

// 按开始时间聚合的一行结果
export interface AvailabilityResult {
  startTime: string
  options:   AvailabilityOption[]
}

// GET /api/availability 完整返回结构
export interface AvailabilityResponse {
  date:            string
  partySize:       number
  acceptsSharing:  boolean
  startTimeFilter: string | null
  durationFilter:  number | null
  results:         AvailabilityResult[]
}

// 桌位分配结果
export interface AssignmentResult {
  tableId:          string
  tableCode:        string
  tableType:        TableType
  bookingMode:      BookingMode
  seatGroupType:    SeatGroupType
}

// POST /api/bookings 请求体
export interface CreateBookingRequest {
  date:             string
  partySize:        number       // 1, 2, 3 或 4（3/4 视为 group）
  acceptsSharing:   boolean
  startTime:        string
  durationMinutes:  number
  customerName:     string
  email:            string
  remark?:          string
}

// POST /api/bookings 成功响应（现在返回 payment_pending 状态，需继续走支付流程）
export interface CreateBookingResponse {
  bookingId:         string
  assignedTableCode: string
  assignedTableType: TableType
  bookingMode:       BookingMode
  endTime:           string
  bufferedEndTime:   string
  depositAmount:     number   // 单位：便士，如 500 = £5
  currency:          string   // 'gbp'
  message:           string
}
