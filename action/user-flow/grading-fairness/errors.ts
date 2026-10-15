/**
 * 阅卷公平性配置的错误类型。
 *
 * 单独放一个模块：`"use server"` 文件只允许导出 async 函数，
 * 类/常量等必须放在普通模块里（`action/user-flow/user-point/upsert.ts` 同理）。
 */

/** 配置校验失败：错误原文面向部长，可直接回显到配置表单 */
export class FairnessProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FairnessProfileValidationError";
  }
}
