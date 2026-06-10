import { ConfigProvider } from "antd";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./router";
import "./styles/app.css";

export function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
        },
      }}
    >
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  );
}
