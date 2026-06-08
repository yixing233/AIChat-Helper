import { htmlExporter } from "./html";
import { markdownExporter } from "./markdown";
import { txtExporter } from "./txt";

export const exporters = {
  html: htmlExporter,
  markdown: markdownExporter,
  txt: txtExporter
};

export type ExportFormat = keyof typeof exporters;
