export interface LayoutCard {
  id: string;
  docKey: string;
  title: string;
  description: string;
  thumbnail: string;
  tags: string[];
  order: number;
}

export interface LayoutData {
  cards: LayoutCard[];
  siteDescription?: string;
}

export interface DocFile {
  key: string;
  name: string;
  lastModified: string;
  size: number;
}
