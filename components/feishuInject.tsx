'use client';
import axios from 'axios';
import { redirect, useRouter } from 'next/navigation';
import Script from 'next/script';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

type FeishuSdkConfig = {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
  onSuccess: (res: unknown) => void;
  onFail: (err: unknown) => void;
};

type FeishuSdk = {
  config: (config: FeishuSdkConfig) => void;
  ready: (cb: () => void) => void;
};

type TTRequestAccessResult = {
  code?: string;
};

type TTBridge = {
  requestAccess: (options: {
    appID: string;
    scopeList: string[];
    success: (res: TTRequestAccessResult) => void;
    fail: (error: unknown) => void;
  }) => void;
};

type WindowWithFeishu = Window & {
  h5sdk?: FeishuSdk;
  tt?: TTBridge;
};

export const FeishuSDKInject: React.FC = () => {
  const route = useRouter();
  useEffect(() => {
    try {
      const win = window as WindowWithFeishu;
      if (win.h5sdk) {
        console.log('[环境]: 飞书浏览器');
        const url = window.location.href;
        axios.get(`/api/auth?url=${url}`).then((res) => {
          console.log(res);
          const { appid, timestamp, nonceStr, signature } = res.data;
          win.h5sdk?.config({
            appId: appid,
            timestamp,
            nonceStr,
            signature,
            onSuccess: (res: unknown) => {
              console.log(`config success: ${JSON.stringify(res)}`);
            },
            //鉴权失败回调
            onFail: (err: unknown) => {
              throw `config failed: ${JSON.stringify(err)}`;
            },
          });
        });
        win.h5sdk.ready(() => {
          console.log('h5sdk is ready');
          win.tt?.requestAccess({
            appID: 'cli_a640b772ca38500e',
            scopeList: [],
            success: (res: TTRequestAccessResult) => {
              const { code } = res;
              console.log(`requestAccess success: `, res);
              if (code) {
                route.replace(`/api/auth/feishu?code=${code}`);
              }
            },
            fail: (error: unknown) => {
              console.error(`requestAccess failed: `, error);
            },
          });
        });
      }
    } catch (e) {}
  }, []);
  return (
    <>
      <Script
        src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.29.js"
        strategy="beforeInteractive"
      ></Script>
      <Script
        src="https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/op/fe/devtools_frontend/remote-debug-0.0.1-alpha.6.js"
        strategy="beforeInteractive"
      ></Script>
    </>
  );
};

export const FeishuRedirect = () => {
  const router = useRouter();

  useEffect(() => {
    const win = window as WindowWithFeishu;
    if (win.h5sdk) {
      console.log('[环境]: 飞书浏览器');
      router.replace('/login/feishu');
    }
  }, []);
  return (
    <>
      <Script
        src="https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.29.js"
        strategy="beforeInteractive"
      ></Script>
    </>
  );
};
