import { defaultContent } from "./defaultContent";
import meetingNotes from "./templates/meetingNotes.md";
import readme from "./templates/readme.md";
import blogPost from "./templates/blogPost.md";

export interface MarkdownTemplate {
  id: string;
  name: string;
  content: string;
  builtin: boolean;
}

export const BUILTIN_TEMPLATES: MarkdownTemplate[] = [
  {
    id: "sample-content",
    name: "sampleContent",
    content: defaultContent,
    builtin: true,
  },
  {
    id: "meeting-notes",
    name: "meetingNotes",
    content: meetingNotes,
    builtin: true,
  },
  {
    id: "readme",
    name: "readme",
    content: readme,
    builtin: true,
  },
  {
    id: "blog-post",
    name: "blogPost",
    content: blogPost,
    builtin: true,
  },
];
