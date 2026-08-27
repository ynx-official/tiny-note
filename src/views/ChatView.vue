<script lang="ts">
import { defineComponent } from 'vue'
import ChatHeader from '../components/chat/ChatHeader.vue'
import ChatMessageStream from '../components/chat/ChatMessageStream.vue'
import ChatComposer from '../components/chat/ChatComposer.vue'
import { useChatWorkspace } from '../composables/useChatWorkspace'

export default defineComponent({
  name: 'ChatView',
  components: { ChatHeader, ChatMessageStream, ChatComposer },
  setup() {
    const workspace = useChatWorkspace()
    return { workspace }
  }
})
</script>

<template>
  <div class="chat-page">
    <ChatHeader :workspace="workspace" />
    <ChatMessageStream :workspace="workspace" />
    <ChatComposer :workspace="workspace" />
  </div>
</template>
