import type { WorkflowPhase } from './api/types'

export const PHASE_ORDER: WorkflowPhase[] = [
  'insurance_type_selection',
  'collecting_info',
  'recommending',
  'identity_verification',
  'quoting',
  'underwriting',
  'payment',
  'completed',
]

export const PHASE_LABELS: Record<WorkflowPhase, string> = {
  insurance_type_selection: '选择保险类型',
  collecting_info: '收集车辆信息',
  recommending: '智能推荐方案',
  identity_verification: '身份验证',
  quoting: '生成报价',
  underwriting: '核保',
  payment: '支付',
  completed: '投保完成',
  transferred_to_human: '人工接管',
}

export const PHASE_DESCRIPTIONS: Record<WorkflowPhase, string> = {
  insurance_type_selection: '请选择您需要的保险类型',
  collecting_info: '正在收集您的车辆信息',
  recommending: '正在为您生成智能推荐方案',
  identity_verification: '请上传投保人身份证正反面',
  quoting: '正在为您生成报价单',
  underwriting: '提交核保审核',
  payment: '完成保费支付',
  completed: '恭喜您投保成功！',
  transferred_to_human: '已为您转接人工客服',
}

export const COMPANY_LOGOS: Record<string, string> = {
  PINGAN: '平安保险',
  PICC: '人保财险',
  CPIC: '太平洋保险',
}

export const INSURANCE_NAMES: Record<string, string> = {
  COMPULSORY: '交强险',
  THIRD_PARTY: '第三者责任险',
  VEHICLE_LOSS: '车辆损失险',
  DRIVER_PASSENGER: '车上人员责任险',
  SCRATCH: '车身划痕险',
  THEFT: '盗抢险',
  GLASS: '玻璃单独破碎险',
  SPONTANEOUS: '自燃损失险',
  WADING: '发动机涉水险',
}

export const DEFAULT_AGENT_ID = 'agent_001'
