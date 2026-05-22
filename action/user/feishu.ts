'use server';
import * as lark from '@larksuiteoapi/node-sdk';
import axios from 'axios';
import SHA1 from 'crypto-js/sha1';
import { cache } from 'react';

let _client: lark.Client | null = null;
function getClient() {
  if (!_client) {
    const appId = process.env.APP_ID;
    const appSecret = process.env.APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('APP_ID and APP_SECRET are required for Feishu integration');
    }
    _client = new lark.Client({
      appId,
      appSecret,
      disableTokenCache: false,
    });
  }
  return _client;
}

const jsapiTicketCache = {
  ticket: '',
  expireTime: 0,
};

export async function getAccessToken() {
  const res = await getClient().auth.tenantAccessToken.internal({
    data: {
      app_id: process.env.APP_ID as string,
      app_secret: process.env.APP_SECRET as string,
    },
  });
  const token = (res as { tenant_access_token?: string }).tenant_access_token;
  if (!token) {
    throw new Error('get tenant access token failed');
  }
  return token;
}

export async function getAppAccessToken() {
  const data = await getClient().auth.appAccessToken.internal({
    data: {
      app_id: process.env.APP_ID as string,
      app_secret: process.env.APP_SECRET as string,
    },
  });
  const token = (data as { app_access_token?: string }).app_access_token;
  if (!token) {
    throw new Error('get app access token failed');
  }
  return token;
}

export async function getJsapiTicket() {
  const now = Date.now();
  if (jsapiTicketCache.ticket && jsapiTicketCache.expireTime > now) {
    return jsapiTicketCache.ticket;
  }
  const res = await axios.post(
    'https://open.feishu.cn/open-apis/jssdk/ticket/get',
    {},
    {
      headers: {
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    },
  );
  const ticket = res.data?.data?.ticket;
  if (!ticket) {
    throw new Error('get jsapi ticket failed');
  }
  jsapiTicketCache.ticket = ticket;
  console.log('js api ticket refreshed: ', jsapiTicketCache.ticket);
  jsapiTicketCache.expireTime = Date.now() + 7200;
  return ticket;
}

export async function getSignature(url: string) {
  const ticket = await getJsapiTicket();
  const timestamp = Date.now();
  const nonceStr = process.env.NONCESTR;
  const verify_str = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = SHA1(verify_str).toString();
  console.log(verify_str, {
    appid: process.env.APP_ID,
    timestamp,
    nonceStr: nonceStr,
    signature,
  });
  return {
    appid: process.env.APP_ID,
    timestamp,
    nonceStr: nonceStr,
    signature,
  };
}

export const get_user_access_token = cache(
  async (
    code: string,
  ): Promise<{
    name: string;
    avatar: string;
    open_id: string;
    union_id: string;
      user_access_token: string;
  }> => {
    const appAccessToken = await getAppAccessToken();
    const res = await axios.post(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        grant_type: 'authorization_code',
        code,
      },
      {
        headers: {
          Authorization: `Bearer ${appAccessToken}`,
        },
      },
    );
    const data = {
      name: res.data?.data?.name,
      avatar: res.data?.data?.avatar_url,
      open_id: res.data?.data?.open_id,
      union_id: res.data?.data?.union_id,
      user_access_token: res.data?.data?.access_token,
    };
    if (!data.user_access_token || !data.open_id || !data.union_id) {
      throw new Error('get user access token failed');
    }
    console.log(data);
    return data;
  },
);

export async function get_user_info(
  user_access_token: string,
  user_id: string,
) {
  const data = await getClient().contact.user.get(
    {
      path: {
        user_id: user_id,
      },
      params: {
        user_id_type: 'open_id',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${user_access_token}`,
      },
    },
  );
  return data.data?.user;
}
