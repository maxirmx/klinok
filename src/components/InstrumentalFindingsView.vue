<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import type { InstrumentalFindingCatalogItem, InstrumentalFindingValue } from "@klinok/contracts";
import { instrumentalFindingById } from "@klinok/contracts";

const props = defineProps<{
  findings: readonly InstrumentalFindingValue[];
  parentFindingId?: string;
}>();

interface FindingPresentation {
  readonly finding: InstrumentalFindingValue;
  readonly inlineText?: string;
  readonly children: readonly InstrumentalFindingValue[];
}

function inlineChildPresentation(
  finding: InstrumentalFindingValue,
  item: InstrumentalFindingCatalogItem | undefined,
): Pick<FindingPresentation, "inlineText" | "children"> | undefined {
  const parentItem = props.parentFindingId
    ? instrumentalFindingById(props.parentFindingId)
    : undefined;
  const selectionSet = parentItem?.selectionSets?.find((set) =>
    set.inlineChildInput && set.choiceIds.includes(finding.findingId));
  const inputItem = item?.children.find((child) => child.kind === "short-text");
  const inputValue = finding.children.find((child) => child.findingId === inputItem?.id);
  if (!selectionSet?.inlineChildInput || !item?.selectionLabel || !inputValue?.value) return undefined;
  const value = `${inputValue.value}${inputValue.unit ? ` ${inputValue.unit}` : ""}`;
  return {
    inlineText: [
      item.selectionLabel,
      selectionSet.inlineChildInput.prefix,
      value,
      selectionSet.inlineChildInput.suffix,
    ].filter(Boolean).join(" "),
    children: finding.children.filter((child) => child.findingId !== inputValue.findingId),
  };
}

const visibleFindings = computed<FindingPresentation[]>(() => props.findings.flatMap((finding) => {
  const item = instrumentalFindingById(finding.findingId);
  if (item?.kind === "group" && !finding.children.length && !finding.value) return [];
  const inlinePresentation = inlineChildPresentation(finding, item);
  return [{
    finding,
    inlineText: inlinePresentation?.inlineText,
    children: inlinePresentation?.children ?? finding.children,
  }];
}));
</script>

<template>
  <ul class="instrumental-history-findings">
    <li v-for="presentation in visibleFindings" :key="presentation.finding.findingId">
      <span v-if="presentation.inlineText">{{ presentation.inlineText }}</span>
      <span v-else>{{ presentation.finding.findingName }}<template v-if="presentation.finding.value">: {{ presentation.finding.value }}{{ presentation.finding.unit ? ` ${presentation.finding.unit}` : "" }}</template></span>
      <InstrumentalFindingsView
        v-if="presentation.children.length"
        :findings="presentation.children"
        :parent-finding-id="presentation.finding.findingId"
      />
    </li>
  </ul>
</template>
