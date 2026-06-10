import type { PropsWithChildren } from "react";
import { Layout, Menu } from "antd";
import { Link, useLocation } from "react-router-dom";
import { StatusHeader } from "./StatusHeader";

const { Content, Header, Sider } = Layout;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={232} theme="light" className="app-shell-sidebar">
        <div className="app-shell-brand">AI Chat Remote</div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={[
            {
              key: "/conversations",
              label: <Link to="/conversations">Conversations</Link>,
            },
            {
              key: "/settings",
              label: <Link to="/settings">Settings</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="app-shell-header">
          <span>Remote Cloud Sync</span>
          <StatusHeader />
        </Header>
        <Content className="app-shell-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
