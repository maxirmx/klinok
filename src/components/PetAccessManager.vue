<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AccessStatusField from "./AccessStatusField.vue";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import PersonIdentity from "./PersonIdentity.vue";
import PetProfileHeader from "./PetProfileHeader.vue";
import type { PetAccessRow } from "../petAccess";
import type { PetProfile } from "../repositories/types";

const props = withDefaults(defineProps<{
  pet: PetProfile;
  rows: PetAccessRow[];
  page: number;
  pageSize: number;
  pageSizes?: readonly number[];
  ownerDisplayName?: string;
  ownerAccountId?: string;
  canAdd?: boolean;
  addLabel?: string;
  emptyMessage?: string;
}>(), {
  pageSizes: () => [10, 20, 50],
  ownerDisplayName: "",
  ownerAccountId: "",
  canAdd: true,
  addLabel: "Предоставить доступ",
  emptyMessage: "Доступы отсутствуют.",
});

const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [pageSize: number];
  add: [];
}>();

defineSlots<{
  headerActions(): unknown;
  accessActions(props: { row: PetAccessRow }): unknown;
  delegationActions(props: { row: PetAccessRow }): unknown;
  default(): unknown;
}>();

const pagedRows = computed(() => props.rows.slice(
  (props.page - 1) * props.pageSize,
  props.page * props.pageSize,
));
</script>

<template>
  <section class="owner-pet-detail owner-pet-access-page pet-access-manager">
    <article class="panel owner-pet-profile">
      <PetProfileHeader
        :pet="pet"
        :owner-display-name="ownerDisplayName"
        :owner-account-id="ownerAccountId"
      >
        <template v-if="canAdd || $slots.headerActions" #actions>
          <button
            v-if="canAdd"
            class="primary-action inline owner-profile-action"
            type="button"
            :title="addLabel"
            :aria-label="addLabel"
            @click="emit('add')"
          >
            <AppIcon name="plus" />
          </button>
          <slot name="headerActions" />
        </template>
      </PetProfileHeader>
    </article>

    <article class="panel owner-access-panel">
      <div class="owner-access-table-wrap">
        <table class="owner-access-table">
          <thead>
            <tr>
              <th>ФИО врача</th>
              <th>Доступ</th>
              <th>Делегирование</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedRows" :key="row.accountId">
              <td class="owner-access-doctor" data-label="ФИО врача">
                <PersonIdentity :display-name="row.displayName" :account-id="row.accountId" />
              </td>
              <td data-label="Доступ">
                <AccessStatusField :status="row.status">
                  <template v-if="$slots.accessActions">
                    <slot name="accessActions" :row="row" />
                  </template>
                </AccessStatusField>
              </td>
              <td
                :class="{ 'is-empty': row.status !== 'granted' }"
                data-label="Делегирование"
              >
                <AccessStatusField
                  :status="row.status"
                  kind="delegation"
                  :delegation-allowed="row.delegationAllowed"
                >
                  <template v-if="$slots.delegationActions">
                    <slot name="delegationActions" :row="row" />
                  </template>
                </AccessStatusField>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="3" class="owner-access-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPaginator
        v-if="rows.length"
        :page="page"
        :page-size="pageSize"
        :total-items="rows.length"
        :page-sizes="pageSizes"
        page-size-label="Врачей на странице"
        aria-label="Навигация по доступам врачей"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </article>

    <slot />
  </section>
</template>
