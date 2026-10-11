import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  CaptainBadge,
  Crest,
  DataTable,
  GameweekPager,
  LoadingState,
  Movement,
  PageHeader,
  SiteHeader,
  SkipLink,
  StateMessage,
  StatList,
  type Column,
} from "@/components/ui";
import { expectNoAxeViolations } from "./axe";

type Row = { id: number; name: string; pts: number };
const columns: Column<Row>[] = [
  { key: "name", header: "Name", rowHeader: true, cell: (r) => r.name },
  { key: "pts", header: "Pts", align: "end", hideBelow: "sm", cell: (r) => r.pts },
];

describe("DataTable", () => {
  it("renders an accessible table with caption, column and row headers", async () => {
    const { container } = render(
      <DataTable caption="Scores" columns={columns} rows={[{ id: 1, name: "Saka", pts: 5 }]} rowKey={(r) => r.id} />,
    );
    const table = screen.getByRole("table", { name: "Scores" });
    expect(within(table).getByRole("columnheader", { name: "Pts" })).toHaveAttribute("scope", "col");
    expect(within(table).getByRole("rowheader", { name: "Saka" })).toHaveAttribute("scope", "row");
    // the scroll container is focusable and labelled, so keyboard users can scroll it
    expect(screen.getByRole("region", { name: "Scores" })).toHaveAttribute("tabindex", "0");
    await expectNoAxeViolations(container);
  });

  it("shows the empty state spanning all columns", () => {
    render(<DataTable caption="Scores" columns={columns} rows={[]} rowKey={(r) => r.id} empty="Nobody yet" />);
    expect(screen.getByRole("cell", { name: "Nobody yet" })).toHaveAttribute("colspan", "2");
  });

  it("marks the current row", () => {
    render(
      <DataTable
        caption="Scores"
        columns={columns}
        rows={[{ id: 1, name: "A", pts: 1 }, { id: 2, name: "B", pts: 2 }]}
        rowKey={(r) => r.id}
        isCurrentRow={(r) => r.id === 2}
      />,
    );
    expect(screen.getByRole("rowheader", { name: "B" }).closest("tr")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("rowheader", { name: "A" }).closest("tr")).not.toHaveAttribute("aria-current");
  });
});

describe("Movement", () => {
  it.each([
    [2, "up 2 places"],
    [-1, "down 1 place"],
    [0, "no change"],
    [null, "new entry"],
  ] as const)("delta %s reads as '%s'", (delta, text) => {
    render(<Movement delta={delta} />);
    expect(screen.getByText(text)).toHaveClass("sr-only");
  });
});

describe("Badges", () => {
  it("expands abbreviations for screen readers", () => {
    render(
      <>
        <CaptainBadge />
        <CaptainBadge vice />
        <CaptainBadge multiplier={3} />
        <Badge>Live</Badge>
      </>,
    );
    expect(screen.getByText("Captain")).toBeInTheDocument();
    expect(screen.getByText("Vice-captain")).toBeInTheDocument();
    expect(screen.getByText("Triple captain")).toBeInTheDocument();
    expect(screen.getByText("C").closest("[aria-hidden]")).toBeTruthy();
  });
});

describe("GameweekPager", () => {
  it("links to neighbours and disables at the bounds", async () => {
    const { container, rerender } = render(<GameweekPager gw={3} min={1} max={6} href={(n) => `/bonus?gw=${n}`} />);
    expect(screen.getByRole("link", { name: "Previous: Gameweek 2" })).toHaveAttribute("href", "/bonus?gw=2");
    expect(screen.getByRole("link", { name: "Next: Gameweek 4" })).toHaveAttribute("href", "/bonus?gw=4");
    await expectNoAxeViolations(container);

    rerender(<GameweekPager gw={6} min={1} max={6} href={(n) => `/bonus?gw=${n}`} />);
    expect(screen.queryByRole("link", { name: /Next/ })).toBeNull();
    expect(screen.getByText("No later gameweek")).toBeInTheDocument();
  });
});

describe("StateMessage", () => {
  it("announces errors and renders actions", async () => {
    const onRetry = vi.fn();
    render(
      <StateMessage tone="error" title="Couldn't load" action={<Button onClick={onRetry}>Try again</Button>}>
        <p>FPL is down.</p>
      </StateMessage>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("is not an alert for empty states", () => {
    render(<StateMessage title="Nothing here" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Nothing here" })).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("exposes a polite status with a text label", () => {
    render(
      <LoadingState label="Loading table">
        <div>skeleton</div>
      </LoadingState>,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading table");
  });
});

describe("Crest", () => {
  it("is decorative by default and falls back to initials", () => {
    const { container } = render(<Crest name="Man City" />);
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("MC");
  });
  it("can be meaningful", () => {
    render(<Crest name="Arsenal" decorative={false} />);
    expect(screen.getByRole("img", { name: "Arsenal" })).toBeInTheDocument();
  });
});

describe("Page chrome", () => {
  it("has a skip link, labelled navigation and marks the current page", async () => {
    const { container } = render(
      <>
        <SkipLink />
        <SiteHeader siteName="The Lobster League" />
        <main id="main">
          <PageHeader title="League" eyebrow="Classic" />
          <StatList items={[{ label: "Leader", value: 430, hint: "Bart's Team" }]} />
        </main>
      </>,
    );
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Table" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Bonus" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 1, name: "League" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
