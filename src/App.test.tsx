import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("工作台", () => {
  beforeEach(() => localStorage.clear());

  it("默认打开《蝌蚪》六卡工作区", async () => {
    render(<MemoryRouter initialEntries={["/essays/demo-tadpoles"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "蝌蚪 · 图卡结构" })).toBeInTheDocument();
    expect(screen.getByText("6/6 已验证")).toBeInTheDocument();
    expect(screen.getAllByText("编辑图卡")).toHaveLength(6);
  });

  it("示例项目显示删除入口但不允许误删", async () => {
    render(<MemoryRouter initialEntries={["/essays/demo-tadpoles"]}><App /></MemoryRouter>);
    const deleteButtons = await screen.findAllByRole("button", { name: "删除当前散文" });
    expect(deleteButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
  });
  it("提示词页面提供复制和 Markdown 下载", async () => {
    render(<MemoryRouter initialEntries={["/essays/demo-tadpoles/prompts"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "提示词清单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /全部复制/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "复制提示词" })).toHaveLength(6);
  });

  it("新建页允许仅输入篇名和作者检索公开原文", async () => {
    render(<MemoryRouter initialEntries={["/essays/new"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "输入篇名，自动提取与生成" })).toBeInTheDocument();
    expect(screen.getByLabelText("散文名")).toHaveValue("背影");
    expect(screen.getByLabelText("作者")).toHaveValue("朱自清");
    expect(screen.getByRole("button", { name: /自动索引并生成六卡/ })).toBeEnabled();
  });
});
