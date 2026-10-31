import { prisma } from "@/lib/db/prisma";

export const BLOG_CATEGORY_SLUGS: Record<string, string> = {
  all: "All Insights",
  "it-strategy": "IT Strategy",
  marketing: "Marketing",
  education: "Education",
  "cloud-architecture": "Cloud Architecture",
  community: "Community",
};

export interface PaginatedBlogResult {
  categorySlug: string;
  categoryName: string;
  currentPage: number;
  totalPages: number;
  totalMatchingPosts: number;
  posts: Array<{
    slug: string;
    title: string;
    excerpt: string;
    categoryName: string;
    categorySlug: string;
    readingTimeMinutes: number;
    publishedAt: Date;
    coverImageUrl: string;
  }>;
}

/**
 * Normalizes blog category queries, prevents cache fragmentation from unescaped spaces,
 * and dynamically calculates totalPages so invalid pages are never rendered.
 * Remediates PERF-01.
 */
export async function getPaginatedBlogPosts(
  rawCategory?: string,
  rawPage?: string
): Promise<PaginatedBlogResult> {
  const pageSize = 6;
  const normalizedSlug = (rawCategory ?? "all").trim().toLowerCase().replace(/\s+/g, "-");
  const categoryName = BLOG_CATEGORY_SLUGS[normalizedSlug] ?? "All Insights";
  const currentPage = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const whereClause =
    categoryName === "All Insights"
      ? { published: true }
      : { published: true, categorySlug: normalizedSlug };

  const [totalMatchingPosts, posts] = await Promise.all([
    prisma.blogPost.count({ where: whereClause }),
    prisma.blogPost.findMany({
      where: whereClause,
      orderBy: { publishedAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        categoryName: true,
        categorySlug: true,
        readingTimeMinutes: true,
        publishedAt: true,
        coverImageUrl: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalMatchingPosts / pageSize));

  return {
    categorySlug: normalizedSlug,
    categoryName,
    currentPage: Math.min(currentPage, totalPages),
    totalPages,
    totalMatchingPosts,
    posts,
  };
}
