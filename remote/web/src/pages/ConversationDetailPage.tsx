import { useEffect, useState } from "react";
import type { ConversationDetailResponse } from "@remote/shared";
import { Card, Descriptions, Space, Tabs, Typography } from "antd";
import { useParams } from "react-router-dom";
import { fetchConversationDetail } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function ConversationDetailPage() {
  const { id = "" } = useParams();
  const [detail, setDetail] = useState<ConversationDetailResponse | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    fetchConversationDetail(requireRemoteConfig(), id).then(setDetail);
  }, [id]);

  const messages = detail?.latestSnapshot.payload.messages ?? [];

  return (
    <Card>
      <Typography.Title level={3}>Conversation Detail</Typography.Title>
      <Descriptions bordered column={1}>
        <Descriptions.Item label="Platform">
          {detail?.conversation.platform ?? "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Title">
          {detail?.conversation.title ?? "-"}
        </Descriptions.Item>
      </Descriptions>
      <Tabs
        items={[
          {
            key: "rendered",
            label: "Rendered",
            children: (
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {messages.map((message) => (
                  <Card key={message.id} size="small">
                    <Typography.Text strong>{message.role}</Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      {message.text || message.html || "-"}
                    </Typography.Paragraph>
                  </Card>
                ))}
              </Space>
            ),
          },
          {
            key: "json",
            label: "Raw JSON",
            children: (
              <pre style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(detail?.latestSnapshot.payload ?? {}, null, 2)}
              </pre>
            ),
          },
        ]}
      />
    </Card>
  );
}
