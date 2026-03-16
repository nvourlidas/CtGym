export type QStatus = 'draft' | 'published' | 'archived';
export type QType = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'rating' | 'date';

export type QuestionRow = {
  id: string; type: QType; label: string; required: boolean; options: string[];
};
