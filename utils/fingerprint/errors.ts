/** Allowlisted diagnostics only: never expose raw exceptions, samples or URLs. */
export const FAULTS = {
  FP_REQUEST_SENDER: '请求不是来自本扩展的主框架，已拒绝',
  FP_REQUEST_SHAPE: '指纹请求参数格式无效，已拒绝',
  FP_REQUEST_ROUTE: '请求会话与浏览器当前标签页不一致，已拒绝',
  FP_REQUEST_TAB: '无法复核浏览器当前标签页，已拒绝',
  FP_REQUEST: '后台拒绝请求：扩展、主框架或会话绑定校验未通过',
  FP_BUSY: '后台正在处理另一项离线评分，请稍后再试',
  FP_DATA_READ: '无法读取扩展内的离线数据文件，请重新加载扩展',
  FP_DATA_JSON: '离线数据文件解析失败，请重新构建并加载扩展',
  FP_DATA_HASH: '离线数据文件完整性校验失败，请重新构建并加载扩展',
  FP_DATA_SCHEMA: '离线模型数据结构或版本校验失败',
  FP_CRYPTO: '后台无法执行离线数据完整性校验',
  FP_SCORE: '本地评分计算失败',
  FP_TIMEOUT: '后台在 30 秒内未响应，请检查扩展后台状态',
  FP_CHANNEL: '无法与扩展后台通信，请重新加载扩展并刷新页面',
  FP_ROUTE: '请求期间当前会话发生变化',
  FP_REPLY: '后台响应缺失或无法与当前请求关联',
  FP_UNKNOWN: '准备阶段发生未分类异常，需要查看扩展后台状态',
} as const;
export type FaultCode = keyof typeof FAULTS;
export function faultCode(value: unknown): FaultCode { return typeof value === 'string' && Object.hasOwn(FAULTS, value) ? value as FaultCode : 'FP_UNKNOWN'; }
export class FingerprintFault extends Error {
  constructor(readonly code: FaultCode) { super(`[${code}] ${FAULTS[code]}`); this.name = 'FingerprintFault'; }
}
export function safeFault(error: unknown, fallback: FaultCode = 'FP_UNKNOWN'): FingerprintFault {
  return error instanceof FingerprintFault ? error : new FingerprintFault(fallback);
}
