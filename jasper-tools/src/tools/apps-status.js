import { getJasperAppStatus } from "../../../jasper-agent/src/apps.js";

export function createAppsStatusTool(context) {
  return {
    id: "apps-status",
    description: "Return Jasper connector approval, activation, and app-request status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    async run() {
      return getJasperAppStatus({
        jasperHome: context.jasperHome,
      });
    },
  };
}
