import { prebuiltAppConfig } from "@mlc-ai/web-llm";

export default {
  model_list: prebuiltAppConfig.model_list,
  use_web_worker: true,
  overrides: {
    context_window_size: 2048,
  },
};
