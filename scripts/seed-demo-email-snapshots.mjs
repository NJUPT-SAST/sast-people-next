import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import { render } from "@react-email/render";
import pg from "pg";

const require = createRequire(import.meta.url);

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    jsx: "react-jsx",
    module: "commonjs",
    moduleResolution: "node",
  },
});

const { default: OfferEmail } = require("../emails/offer.tsx");

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (!existsSync(envPath)) continue;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] ??= value.replace(/^['"]|['"]$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to seed email snapshots.");
}

const demoDeliveries = [
  {
    id: 501,
    name: "Demo Freshman D",
    flowName: "2026 春季笔试招新 Demo",
    accept: true,
  },
  {
    id: 502,
    name: "Demo Freshman C",
    flowName: "2026 春季笔试招新 Demo",
    accept: false,
  },
  {
    id: 503,
    name: "Demo Freshman E",
    flowName: "2026 春季笔试招新 Demo",
    accept: false,
  },
];

function getTemplateKey(accept) {
  return `recruitment.result.${accept ? "accepted" : "rejected"}`;
}

async function getTemplateSettings(client) {
  const rows = await client.query(`
    select
      template_key,
      member_info_form_url,
      feishu_group_url,
      calendar_url,
      feishu_register_help_url,
      contact_email,
      member_form_label,
      feishu_group_name
    from email_template_setting
    where template_key in ('recruitment.result.accepted', 'recruitment.result.rejected')
  `);

  return new Map(rows.rows.map((row) => [row.template_key, row]));
}

function renderDemoEmail(delivery, setting) {
  return render(
    React.createElement(OfferEmail, {
      name: delivery.name,
      flowName: delivery.flowName,
      accept: delivery.accept,
      memberInfoFormUrl: setting?.member_info_form_url,
      feishuGroupUrl: setting?.feishu_group_url,
      calendarUrl: setting?.calendar_url,
      feishuRegisterHelpUrl: setting?.feishu_register_help_url,
      contactEmail: setting?.contact_email,
      memberFormLabel: setting?.member_form_label,
      feishuGroupName: setting?.feishu_group_name,
    }),
  );
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  const settings = await getTemplateSettings(client);

  for (const delivery of demoDeliveries) {
    const htmlSnapshot = await renderDemoEmail(
      delivery,
      settings.get(getTemplateKey(delivery.accept)),
    );

    await client.query(
      `
        update email_delivery
        set html_snapshot = $1, updated_at = now()
        where id = $2
      `,
      [htmlSnapshot, delivery.id],
    );
  }

  console.log("Seeded demo email snapshots from the real template.");
} finally {
  await client.end();
}
