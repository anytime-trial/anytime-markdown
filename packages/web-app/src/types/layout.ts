import { z } from 'zod';

export const layoutCategoryItemSchema = z.object({
  docKey: z.string().max(500),
  displayName: z.string().max(200),
  url: z.string().max(2000).refine((v) => v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'), {
    message: 'Must be a URL or an absolute path starting with /',
  }).optional(),
});

export const layoutCategorySchema = z.object({
  id: z.string().max(100),
  title: z.string().max(200),
  description: z.string().max(1000),
  items: z.array(layoutCategoryItemSchema).max(50),
  order: z.number().int().min(0),
});

export const layoutDataSchema = z.object({
  categories: z.array(layoutCategorySchema).max(100),
  siteDescription: z.string().max(500).optional(),
});

export type LayoutCategoryItem = z.infer<typeof layoutCategoryItemSchema>;
export type LayoutCategory = z.infer<typeof layoutCategorySchema>;
export type LayoutData = z.infer<typeof layoutDataSchema>;

export interface DocFile {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}
