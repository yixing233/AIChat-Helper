import { useEffect, useState } from "react";
import type { ConversationListItem } from "@remote/shared";
import { Card, Input, Space, Table, Typography } from "antd";
import { Link } from "react-router-dom";
import { fetchConversations } from "../services/api";
import { requireRemoteConfig } from "../services/storage";

export function ConversationsPage() {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchConversations(requireRemoteConfig()).then((response) => {
      setItems(response.items);
    });
  }, []);

  const filteredItems = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Title level={3}>Synced Conversations</Typography.Title>
        <Input
          placeholder="Search conversations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Table
          rowKey="id"
          pagination={false}
          dataSource={filteredItems}
          columns={[
            { title: "Platform", dataIndex: "platform" },
            {
              title: "Title",
              dataIndex: "title",
              render: (title: string, record) => (
                <Link to={`/conversations/${record.id}`}>{title}</Link>
              ),
            },
            { title: "Messages", dataIndex: "messageCount" },
            { title: "Updated", dataIndex: "updatedAt" },
          ]}
        />
      </Space>
    </Card>
  );
}
