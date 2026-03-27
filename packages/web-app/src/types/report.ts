import { z } from 'zod';

export const reportFrontmatterSchema = z.object({
  title: z.string().max(200),
  date: z.string().max(30),
  author: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  thumbnail: z.string().max(500).optional(),
  excerpt: z.string().max(500).optional(),
});

export type ReportFrontmatter = z.infer<typeof reportFrontmatterSchema>;

export interface ReportMeta extends ReportFrontmatter {
  /** S3キーから生成: "reports/my-post.md" → "my-post" */
  slug: string;
  /** S3キー全体: "reports/my-post.md" */
  key: string;
}
