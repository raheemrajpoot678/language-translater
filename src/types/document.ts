export interface Document {
  id: string;
  name: string;
  uploadDate: Date;
  size: number;
  type: string;
  originalText?: string;
  translatedText?: string;
  audioUrl?: string;
  imageUrl?: string;
  isExpanded?: boolean;
}