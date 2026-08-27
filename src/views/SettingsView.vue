<script lang="ts">
import { defineComponent } from 'vue'
import SettingsNavigation from '../components/settings/SettingsNavigation.vue'
import SettingsDetail from '../components/settings/SettingsDetail.vue'
import SettingsModelDialog from '../components/settings/SettingsModelDialog.vue'
import { useSettingsWorkspace } from '../composables/useSettingsWorkspace'

export default defineComponent({
  name: 'SettingsView',
  components: { SettingsNavigation, SettingsDetail, SettingsModelDialog },
  setup() {
    const workspace = useSettingsWorkspace()
    return { workspace }
  }
})
</script>

<template>
  <div class="settings-page" @click="workspace.closeDropdowns">
    <div class="settings-shell">
      <SettingsNavigation :workspace="workspace" />
      <SettingsDetail :workspace="workspace" />
    </div>
    <SettingsModelDialog :workspace="workspace" />
  </div>
</template>
