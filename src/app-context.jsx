import { createContext, useContext } from 'react';

/** 应用配置上下文。Admin 与壳共用，避免 Admin 为 useApp 去 import 入口模块。 */
export const Ctx = createContext();
export const useApp = () => useContext(Ctx);
