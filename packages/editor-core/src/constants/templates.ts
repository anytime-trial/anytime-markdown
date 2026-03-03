import { defaultContent } from "./defaultContent";
import meetingNotes from "./templates/meetingNotes.md";
import readme from "./templates/readme.md";
import blogPost from "./templates/blogPost.md";
import basicDesign from "./templates/basicDesign.md";
import apiSpec from "./templates/apiSpec.md";
import adr from "./templates/adr.md";

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
  {
    id: "basic-design",
    name: "basicDesign",
    content: basicDesign,
    builtin: true,
  },
  {
    id: "api-spec",
    name: "apiSpec",
    content: apiSpec,
    builtin: true,
  },
  {
    id: "adr",
    name: "adr",
    content: adr,
    builtin: true,
  },
];
