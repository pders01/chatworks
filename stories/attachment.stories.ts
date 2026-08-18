import type { Meta, StoryObj } from "@storybook/web-components-vite";
import { html } from "lit";
import { CwAttachment } from "../src/components/attachment.js";
import type { AttachmentInfo } from "../src/lib/chat-types.js";

void CwAttachment;

const fileAttachment: AttachmentInfo = {
  filename: "implementation-notes.md",
  mimeType: "text/markdown",
  size: 18_432,
};

const imageAttachment: AttachmentInfo = {
  filename: "board-layout.svg",
  mimeType: "image/svg+xml",
  size: 2_048,
  url: `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" fill="#dce6f7"/>
      <rect x="14" y="18" width="26" height="84" rx="4" fill="#7893be"/>
      <rect x="47" y="18" width="26" height="62" rx="4" fill="#526f9e"/>
      <rect x="80" y="18" width="26" height="74" rx="4" fill="#31527f"/>
    </svg>
  `)}`,
};

type AttachmentArgs = {
  attachment: AttachmentInfo;
  removable: boolean;
};

const meta = {
  title: "Data display/Attachment",
  component: "cw-attachment",
  parameters: {
    docs: {
      description: {
        component:
          "Small transport-free file/image primitive used by compatibility chat compositions.",
      },
    },
  },
  args: {
    attachment: fileAttachment,
    removable: false,
  },
  render: (args: AttachmentArgs) => html`
    <div class="story-frame constrained centered">
      <div role="list" aria-label="Attachments">
        <cw-attachment
          .attachment=${args.attachment}
          .removable=${args.removable}
          list-item
        ></cw-attachment>
      </div>
    </div>
  `,
} satisfies Meta<AttachmentArgs>;

export default meta;
type Story = StoryObj<AttachmentArgs>;

export const File: Story = {};

export const Image: Story = {
  args: { attachment: imageAttachment },
};

export const Removable: Story = {
  args: { removable: true },
};
