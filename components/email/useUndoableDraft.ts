"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";

/**
 * 草稿级撤销/重做：管的是「画布上发生了什么」（加/删/移动区块、改样式、改外观），
 * 不是 TipTap 内部的文字撤销（编辑区里 Ctrl+Z 仍然由 ProseMirror 自己处理）。
 *
 * 连续输入（每敲一个字都触发 onChange）不应该变成逐字撤销，所以 600ms 内的连续修改
 * 合并成一步：只在停顿之后再产生新的历史点。
 */

const COALESCE_MS = 600;
const MAX_HISTORY = 50;

type State<T> = {
  value: T;
  past: T[];
  future: T[];
  lastAt: number;
};

type Action<T> =
  | { type: "set"; value: T | ((current: T) => T); now: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case "set": {
      /* 函数式更新在 reducer 里基于最新 state 求值:
         同一事件里连续两次 set 不会拿旧值互相覆盖 */
      const value =
        typeof action.value === "function"
          ? (action.value as (current: T) => T)(state.value)
          : action.value;
      const coalesce = action.now - state.lastAt < COALESCE_MS;
      return {
        value,
        past: coalesce
          ? state.past
          : [...state.past, state.value].slice(-MAX_HISTORY),
        future: [],
        lastAt: action.now,
      };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        value: previous,
        past: state.past.slice(0, -1),
        future: [state.value, ...state.future].slice(0, MAX_HISTORY),
        lastAt: 0,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        value: next,
        past: [...state.past, state.value].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        lastAt: 0,
      };
    }
    case "reset":
      return { value: action.value, past: [], future: [], lastAt: 0 };
    default:
      return state;
}

}
export function useUndoableDraft<T>(
  initial: T | (() => T),
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [state, dispatch] = useReducer(reducer<T>, initial, (arg) => ({
    value: typeof arg === "function" ? (arg as () => T)() : arg,
    past: [],
    future: [],
    lastAt: 0,
  }));

  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      dispatch({ type: "set", value: next, now: Date.now() }),
    [],
  );

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);

  /* 键盘：⌘/Ctrl+Z 撤销、⌘/Ctrl+Shift+Z 重做。
     焦点在富文本编辑区里时让 ProseMirror 自己处理文字撤销，不抢它的按键。 */
  useEffect(() => {
    /* 对话框关闭时不注册:否则每张模板卡片的草稿都会响应同一次 ⌘Z */
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target?.closest(".ProseMirror, input, textarea, select")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, undo, redo]);

  return useMemo(
    () => ({
      value: state.value,
      set,
      undo,
      redo,
      reset,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state.value, state.past.length, state.future.length, set, undo, redo, reset],
  );
}
