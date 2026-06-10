import { useEffect, useState } from "react";
import type { SystemStatusResponse } from "@remote/shared";
import { Card, Descriptions, Typography } from "antd";
import { fetchSystemStatus } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function SettingsPage() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);

  useEffect(() => {
    fetchSystemStatus(requireRemoteConfig()).then(setStatus);
  }, []);

  return (
    <Card>
      <Typography.Title level={3}>System Settings</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Database">
          {status?.database ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Service">
          {status?.service ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Conversations">
          {status?.conversationCount ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Devices">
          {status?.deviceCount ?? "-"}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
