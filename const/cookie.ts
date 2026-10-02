export const SESSION = "session";
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const IS_BINDING = "is_binding";
export const LINK_OAUTH_STATE = "link_oauth_state";
export const FEISHU_OAUTH_STATE = "feishu_oauth_state";
export const FEISHU_OAUTH_RETURN_TO = "feishu_oauth_return_to";
/**
 * 管理员「切换身份查看」的临时视角（加密 JSON：{ role, department }）。
 * 只在会话本身的角色是管理员时生效，删掉这个 cookie 就回到管理员本人。
 */
export const VIEW_AS = "view_as";
