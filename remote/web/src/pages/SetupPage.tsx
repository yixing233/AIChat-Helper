import { Button, Card, Form, Input, Typography, message } from "antd";
import type { RemoteConfig } from "../services/storage";
import { saveRemoteConfig } from "../services/storage";
import { validateToken as validateRemoteToken } from "../services/api";

type SetupPageProps = {
  validateToken?: (config: RemoteConfig) => Promise<unknown>;
  onConnected?: () => void;
};

export function SetupPage({
  validateToken = validateRemoteToken,
  onConnected,
}: SetupPageProps) {
  const [form] = Form.useForm<RemoteConfig>();

  async function handleFinish(values: RemoteConfig) {
    const config = {
      baseUrl: values.baseUrl.trim(),
      token: values.token.trim(),
    };

    try {
      await validateToken(config);
      saveRemoteConfig(config);
      message.success("Remote service connected");
      onConnected?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Connection test failed";
      message.error(errorMessage);
    }
  }

  return (
    <main className="setup-page">
      <Card className="setup-card">
        <Typography.Title level={2}>Connect Remote Service</Typography.Title>
        <Typography.Paragraph type="secondary">
          Add your cloud sync endpoint and personal access token to connect this
          beta client.
        </Typography.Paragraph>

        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.Item
            label="Service URL"
            name="baseUrl"
            rules={[
              { required: true, message: "Service URL is required" },
              { type: "url", message: "Enter a valid URL" },
            ]}
          >
            <Input placeholder="https://remote.example.com" />
          </Form.Item>

          <Form.Item
            label="Access Token"
            name="token"
            rules={[{ required: true, message: "Access token is required" }]}
          >
            <Input.Password placeholder="Personal bearer token" />
          </Form.Item>

          <Button type="primary" htmlType="submit" block>
            Test Connection
          </Button>
        </Form>
      </Card>
    </main>
  );
}
