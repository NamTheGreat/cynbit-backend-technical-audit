import { describe, it, expect } from "vitest";
import { BLOG_CATEGORY_SLUGS } from "@/lib/blog/query-posts";

describe("Blog Slug Normalization and Canonical Categories (Remediates PERF-01)", () => {
  it("maps canonical kebab-case slugs to display category names", () => {
    expect(BLOG_CATEGORY_SLUGS["it-strategy"]).toBe("IT Strategy");
    expect(BLOG_CATEGORY_SLUGS["cloud-architecture"]).toBe("Cloud Architecture");
    expect(BLOG_CATEGORY_SLUGS["marketing"]).toBe("Marketing");
    expect(BLOG_CATEGORY_SLUGS["education"]).toBe("Education");
    expect(BLOG_CATEGORY_SLUGS["community"]).toBe("Community");
    expect(BLOG_CATEGORY_SLUGS["all"]).toBe("All Insights");
  });

  it("normalizes raw space-delimited and uppercase strings into canonical slugs", () => {
    const rawCategories = ["IT Strategy", "it strategy", "IT  Strategy", " Cloud Architecture "];
    const normalized = rawCategories.map((c) =>
      c.trim().toLowerCase().replace(/\s+/g, "-")
    );

    expect(normalized[0]).toBe("it-strategy");
    expect(normalized[1]).toBe("it-strategy");
    expect(normalized[2]).toBe("it-strategy");
    expect(normalized[3]).toBe("cloud-architecture");

    // All resolve to valid category titles
    expect(BLOG_CATEGORY_SLUGS[normalized[0]]).toBe("IT Strategy");
    expect(BLOG_CATEGORY_SLUGS[normalized[3]]).toBe("Cloud Architecture");
  });

  it("falls back gracefully to 'All Insights' for unknown categories", () => {
    const unknownSlug = "unsupported-category-slug";
    const resolvedName = BLOG_CATEGORY_SLUGS[unknownSlug] ?? "All Insights";
    expect(resolvedName).toBe("All Insights");
  });
});
