<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, nextTick, reactive, ref, toRaw, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  normalizeRussianSearchText,
  normalizeInstrumentalTestsValue,
  normalizeLaboratoryTestsValue,
  type InstrumentalTestsSectionValue,
  type LaboratoryTestsSectionValue,
  type DirectoryPetDto,
  type DirectoryProfileDto,
  type DoctorPetAccessDto,
  type PetGrantAction,
} from "@klinok/contracts";
import AccessStatusField from "../components/AccessStatusField.vue";
import AppIcon from "../components/AppIcon.vue";
import AppPaginator from "../components/AppPaginator.vue";
import AppSelect from "../components/AppSelect.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import EncounterEditorForm from "../components/EncounterEditorForm.vue";
import EpicrisisTable from "../components/EpicrisisTable.vue";
import MedicalRecordEntry from "../components/MedicalRecordEntry.vue";
import LaboratoryComparison from "../components/LaboratoryComparison.vue";
import ModalDialog from "../components/ModalDialog.vue";
import PetAccessManager from "../components/PetAccessManager.vue";
import PetProfileView from "../components/PetProfileView.vue";
import PersonIdentity from "../components/PersonIdentity.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import {
  appState,
  loadDoctorPetAccesses,
  lookupPetDirectory,
  logout,
  requireRepository,
  searchDoctorDirectory,
  searchPetDirectory,
} from "../appStore";
import {
  ENCOUNTER_SECTION_LABELS,
  ENCOUNTER_SECTION_ORDER,
  OPTIONAL_ENCOUNTER_SECTION_KINDS,
  diagnosisDraft,
  emptyDiagnosisDraft,
  emptyGeneralDataDraft,
  emptyVaccinationDraft,
  generalDataDraft,
  isFreeTextValue,
  isDiagnosisValue,
  isGeneralDataValue,
  isOutcomeValue,
  isVaccinationValue,
  isWhatHappenedValue,
  medicalRecordSearchText,
  parseGeneralDataDraft,
  parseDiagnosisDraft,
  parseVaccinationDraft,
  vaccinationDraft,
} from "../medicalEncounter";
import {
  emptyTherapeuticAppointmentDraft,
  isTherapeuticAppointmentValue,
  parseTherapeuticAppointmentDraft,
  therapeuticAppointmentDraft,
} from "../therapeuticAppointment";
import type { PetAccessRow } from "../petAccess";
import type {
  MedicalEncounterSectionInputValue,
  MedicalEncounterSectionKind,
  MedicalRecordDraft,
} from "../repositories/types";
import { useAlertStore } from "../stores/alert";

const props = defineProps<{ role: "doctor"; scenarioId: string }>();
type HomeSortField = "owner" | "pet";
type SortDirection = "asc" | "desc";
type HomeAccessFilter = "all" | DoctorPetAccessDto["status"];
const homeFilterOptions = [
  { value: "all", label: "Все" },
  { value: "granted", label: "Медицинские карты" },
  { value: "requested", label: "Ожидающие запросы" },
  { value: "revoked", label: "Отозванные" },
];
const historySectionOptions = [
  { value: "", label: "Все разделы" },
  ...ENCOUNTER_SECTION_ORDER.map((value) => ({ value, label: ENCOUNTER_SECTION_LABELS[value] })),
];
const historyStatusOptions = [
  { value: "", label: "Все статусы" },
  { value: "confirmed", label: "Подтверждённые" },
  { value: "unconfirmed", label: "Не подтверждённые" },
];
const historySortOptions = [
  { value: "desc", label: "Сначала новые" },
  { value: "asc", label: "Сначала старые" },
];
interface DoctorHomeAccessRow {
  petId: string;
  ownerAccountId: string;
  ownerDisplayName: string;
  species: string;
  name: string;
  status: PetAccessRow["status"];
  permissions?: readonly PetGrantAction[];
  grantId?: string;
  requestId?: string;
  actionable: boolean;
}
const route = useRoute();
const router = useRouter();
const alertStore = useAlertStore();
const busy = ref(false);
const pageSizes = [10, 20, 50] as const;
const homeQuery = ref("");
const homeFilter = ref<HomeAccessFilter>("all");
const homeSort = ref<HomeSortField>("owner");
const homeSortDirection = ref<SortDirection>("asc");
const homePage = ref(1);
const storedPageSize = Number(localStorage.getItem("klinok:doctor-pets-page-size"));
const homePageSize = ref<(typeof pageSizes)[number]>(pageSizes.includes(storedPageSize as never) ? storedPageSize as never : 10);
const homeAccesses = ref<DoctorPetAccessDto[]>([]);
const homeTotal = ref(0);
const selectedDirectoryPet = ref<DirectoryPetDto | null>(null);
let accessRefreshId = 0;
const requestDialogOpen = ref(props.scenarioId === "doctor-pet-request-access");
const requestError = ref("");
const petOwnerQuery = ref("");
const petNameQuery = ref("");
const petSearchResults = ref<DirectoryPetDto[]>([]);
const petSearchPerformed = ref(false);
const doctorQuery = ref("");
const doctors = ref<DirectoryProfileDto[]>([]);
const doctorSearchPerformed = ref(false);
const delegationTarget = ref<DirectoryProfileDto | null>(null);
const delegationDelegate = ref(false);
const delegationConfirm = ref(false);
const delegationDialogOpen = ref(false);
const delegationError = ref("");
const delegationPage = ref(1);
const delegationPageSize = ref<(typeof pageSizes)[number]>(10);
const relinquishConfirm = ref(false);
const relinquishTarget = ref<{ petId: string; petName: string; grantId: string } | null>(null);
const recordDeleteConfirm = ref(false);
const recordDeleteTarget = ref<MedicalRecordDraft | null>(null);
const sectionDeleteConfirm = ref(false);
const sectionDeleteTarget = ref<MedicalEncounterSectionKind | null>(null);
const historyQuery = ref("");
const historyFrom = ref("");
const historyTo = ref("");
const historySection = ref<MedicalEncounterSectionKind | "">("");
const historyStatus = ref<"" | "confirmed" | "unconfirmed">("");
const historySort = ref<"desc" | "asc">("desc");
const historyPage = ref(1);
const historyPageSize = ref<(typeof pageSizes)[number]>(10);
const epicrisisPage = ref(1);
const epicrisisPageSize = ref<(typeof pageSizes)[number]>(10);

function updateHomeFilter(value: string) { homeFilter.value = value as HomeAccessFilter; }
function updateHistorySection(value: string) { historySection.value = value as MedicalEncounterSectionKind | ""; }
function updateHistoryStatus(value: string) { historyStatus.value = value as "" | "confirmed" | "unconfirmed"; }
function updateHistorySort(value: string) { historySort.value = value as "desc" | "asc"; }

const encounter = reactive({
  recordId: "",
  date: new Date().toISOString().slice(0, 10),
  selectedIds: [] as string[],
  comment: "",
  outcomeSelectedIds: [] as string[],
  outcomeComment: "",
  optionalKinds: [] as MedicalEncounterSectionKind[],
  texts: {} as Partial<Record<MedicalEncounterSectionKind, string>>,
  generalData: emptyGeneralDataDraft(),
  vaccination: emptyVaccinationDraft(),
  therapeuticAppointment: emptyTherapeuticAppointmentDraft(),
  diagnosis: emptyDiagnosisDraft(),
  laboratoryTests: { studies: [] } as LaboratoryTestsSectionValue,
  instrumentalTests: { studies: [] } as InstrumentalTestsSectionValue,
});

const profileName = computed(() => [appState.control.profile?.firstName, appState.control.profile?.patronymic, appState.control.profile?.lastName].filter(Boolean).join(" "));
const petId = computed(() => String(route.params.petId ?? ""));
const selectedPet = computed(() => appState.medical.pets.find((pet) => pet.petId === petId.value) ?? null);
const routeGrantId = computed(() => typeof route.query.grantId === "string" ? route.query.grantId : "");
const selectedGrant = computed(() => {
  const candidates = appState.medical.grants.filter((grant) => grant.petId === petId.value
    && grant.granteeAccountId === appState.session.accountId && localGrantEffectivelyActive(grant.grantId));
  if (routeGrantId.value) return candidates.find((grant) => grant.grantId === routeGrantId.value) ?? null;
  return candidates.length === 1 ? candidates[0]! : null;
});
const canWrite = computed(() => selectedGrant.value?.actions.includes("write_unconfirmed") ?? false);
const canDelegate = computed(() => selectedGrant.value?.actions.includes("delegate") ?? false);
const confirmedIds = computed(() => new Set(appState.medical.confirmedRecordIds));
const petRecords = computed(() => appState.medical.records.filter((record) => record.petId === petId.value));
const epicrisisRecords = computed(() => [...petRecords.value].sort((left, right) => {
  const dateOrder = left.encounterDate.localeCompare(right.encounterDate)
    || left.createdAt.localeCompare(right.createdAt);
  return dateOrder ? -dateOrder : left.recordId.localeCompare(right.recordId);
}));
const epicrisisPageCount = computed(() => Math.max(1, Math.ceil(epicrisisRecords.value.length / epicrisisPageSize.value)));
const currentDirectoryPet = computed(() => selectedDirectoryPet.value?.petId === petId.value
  ? selectedDirectoryPet.value
  : homeAccesses.value.find((pet) => pet.petId === petId.value));
const homeRows = computed<DoctorHomeAccessRow[]>(() => homeAccesses.value.map((access) => ({
  ...access,
  ownerDisplayName: access.ownerDisplayName || "ФИО не указано",
  species: access.species ?? "",
  name: access.name ?? "Данные питомца недоступны",
  actionable: (() => {
    if (access.status === "requested") {
      return Boolean(access.requestId && appState.medical.accessRequests.some((request) =>
        request.requestId === access.requestId && request.petId === access.petId &&
        request.requesterAccountId === appState.session.accountId && request.status === "pending"));
    }
    if (access.status !== "granted") return true;
    const grant = access.grantId
      ? appState.medical.grants.find((candidate) => candidate.grantId === access.grantId)
      : undefined;
    return Boolean(grant && grant.petId === access.petId &&
      grant.granteeAccountId === appState.session.accountId &&
      appState.medical.pets.some((pet) => pet.petId === access.petId) &&
      localGrantEffectivelyActive(grant.grantId));
  })(),
})));

function localGrantEffectivelyActive(grantId: string, visited = new Set<string>()): boolean {
  const grant = appState.medical.grants.find((candidate) => candidate.grantId === grantId);
  if (!grant || grant.status !== "active" || visited.has(grantId)) return false;
  if (!grant.parentGrantId) return true;
  visited.add(grantId);
  return localGrantEffectivelyActive(grant.parentGrantId, visited);
}
const delegatedAccessRows = computed<PetAccessRow[]>(() => {
  if (!selectedGrant.value) return [];
  return appState.medical.grants
    .filter((grant) => grant.parentGrantId === selectedGrant.value!.grantId)
    .map((grant): PetAccessRow => {
      const profile = appState.control.profiles.find((candidate) => candidate.accountId === grant.granteeAccountId);
      return {
        accountId: grant.granteeAccountId,
        displayName: grant.granteeDisplayName
          || (profile ? [profile.firstName, profile.patronymic, profile.lastName].filter(Boolean).join(" ") : grant.granteeAccountId),
        status: grant.status === "active" ? "granted" : "revoked",
        delegationAllowed: grant.actions.includes("delegate"),
        grantId: grant.grantId,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
});
const delegationPageCount = computed(() => Math.max(1, Math.ceil(delegatedAccessRows.value.length / delegationPageSize.value)));
const sectionDeleteDescription = computed(() => sectionDeleteTarget.value
  ? `Раздел «${ENCOUNTER_SECTION_LABELS[sectionDeleteTarget.value]}» и введённые в нём данные будут удалены из записи.`
  : "Раздел и введённые в нём данные будут удалены из записи.");
const relinquishDescription = computed(() => relinquishTarget.value
  ? `Вы и все врачи, которым вы делегировали доступ к ${relinquishTarget.value.petName}, потеряете доступ к медицинской карте`
  : "Вы и все врачи, которым вы делегировали доступ, потеряете доступ к медицинской карте");

const filteredRecords = computed(() => petRecords.value.filter((record) => {
  const confirmed = confirmedIds.value.has(record.recordId);
  if (historyStatus.value === "confirmed" && !confirmed) return false;
  if (historyStatus.value === "unconfirmed" && confirmed) return false;
  if (historyFrom.value && record.encounterDate < historyFrom.value) return false;
  if (historyTo.value && record.encounterDate > historyTo.value) return false;
  if (historySection.value && !record.sections[historySection.value]) return false;
  const query = normalizeRussianSearchText(historyQuery.value);
  const content = normalizeRussianSearchText(medicalRecordSearchText(record));
  return !query || content.includes(query);
}).sort((left, right) => (historySort.value === "desc" ? -1 : 1) * (left.encounterDate.localeCompare(right.encounterDate) || left.createdAt.localeCompare(right.createdAt))));
const pagedRecords = computed(() => filteredRecords.value.slice((historyPage.value - 1) * historyPageSize.value, historyPage.value * historyPageSize.value));

async function openMedicalRecord(recordId: string) {
  if (!petRecords.value.some((record) => record.recordId === recordId)) return;
  historyQuery.value = "";
  historyFrom.value = "";
  historyTo.value = "";
  historySection.value = "";
  historyStatus.value = "";
  historyPage.value = 1;
  await nextTick();

  const targetIndex = filteredRecords.value.findIndex((record) => record.recordId === recordId);
  if (targetIndex < 0) return;
  historyPage.value = Math.floor(targetIndex / historyPageSize.value) + 1;
  await nextTick();

  const target = document.getElementById(`encounter-${recordId}`) as HTMLDetailsElement | null;
  if (!target) return;
  target.open = true;
  target.scrollIntoView?.({ block: "start" });
  target.querySelector<HTMLElement>("summary")?.focus();
}

async function perform(task: () => Promise<unknown>, success = ""): Promise<boolean> {
  busy.value = true;
  alertStore.clear();
  try {
    await task();
    if (success) alertStore.success(success);
    return true;
  } catch (reason) {
    alertStore.error(reason, "Операция не выполнена.");
    return false;
  } finally {
    busy.value = false;
  }
}

async function performModal(error: { value: string }, task: () => Promise<unknown>, fallback: string): Promise<boolean> {
  busy.value = true;
  error.value = "";
  try {
    await task();
    return true;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : fallback;
    return false;
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  if (await logout()) await router.replace("/auth/login");
}

async function refreshAccesses() {
  const refreshId = ++accessRefreshId;
  try {
    const result = await loadDoctorPetAccesses(
      homeQuery.value,
      homeFilter.value,
      homePage.value,
      homePageSize.value,
      homeSort.value,
      homeSortDirection.value,
    );
    if (refreshId !== accessRefreshId) return;
    homeAccesses.value = result.items;
    homeTotal.value = result.total;
    if (homePage.value !== result.page) homePage.value = result.page;
  } catch (reason) {
    if (refreshId === accessRefreshId) alertStore.error(reason, "Не удалось загрузить список доступов.");
  }
}

async function refreshSelectedDirectoryPet(id: string) {
  selectedDirectoryPet.value = null;
  if (!id) return;
  try {
    selectedDirectoryPet.value = await lookupPetDirectory(id);
  } catch {
    // The paged directory remains a useful fallback when the direct lookup is unavailable.
  }
}

function changeHomeSort(field: HomeSortField) {
  if (homeSort.value === field) homeSortDirection.value = homeSortDirection.value === "asc" ? "desc" : "asc";
  else {
    homeSort.value = field;
    homeSortDirection.value = "asc";
  }
}

function homeSortAria(field: HomeSortField): "ascending" | "descending" | "none" {
  if (homeSort.value !== field) return "none";
  return homeSortDirection.value === "asc" ? "ascending" : "descending";
}

async function findPets() {
  petSearchResults.value = [];
  petSearchPerformed.value = false;
  await performModal(requestError, async () => {
    const owner = petOwnerQuery.value.trim();
    const pet = petNameQuery.value.trim();
    if (!owner) petSearchResults.value = [await lookupPetDirectory(pet)];
    else {
      const result = await searchPetDirectory(owner, pet, 1, 50);
      petSearchResults.value = result.items;
    }
    petSearchPerformed.value = true;
  }, "Не удалось найти питомца.");
}

async function requestAccess(pet: DirectoryPetDto) {
  let autoApproved = false;
  const succeeded = await performModal(requestError, async () => {
    const currentPet = await lookupPetDirectory(pet.petId);
    if (currentPet.ownerAccountId !== pet.ownerAccountId) {
      throw new Error("Данные владельца питомца изменились. Обновите результаты поиска.");
    }
    const requestId = await requireRepository().medical.requestAccess(currentPet.petId, currentPet.ownerAccountId);
    autoApproved = appState.medical.grants.some((candidate) =>
      candidate.requestId === requestId && candidate.petId === pet.petId && candidate.status === "active",
    );
    petSearchResults.value = petSearchResults.value.filter((candidate) => candidate.petId !== pet.petId);
    if (!petSearchResults.value.length) petSearchPerformed.value = false;
  }, "Не удалось отправить запрос.");
  if (succeeded) {
    alertStore.success(autoApproved ? "Доступ предоставлен автоматически." : "Запрос отправлен владельцу.");
    requestDialogOpen.value = false;
    await refreshAccesses();
  }
}

async function cancelPendingRequest(petId: string, requestId: string) {
  const succeeded = await perform(async () => {
    const current = (await loadDoctorPetAccesses(petId, "requested", 1, 50, "owner", "asc")).items
      .find((access) => access.petId === petId && access.requestId === requestId && access.status === "requested");
    if (!current) throw new Error("Статус запроса изменился. Обновите список перед повторной попыткой.");
    await requireRepository().medical.cancelAccessRequest(requestId);
  }, "Запрос на доступ отозван.");
  if (succeeded) await refreshAccesses();
}

function openRequestDialog() {
  requestError.value = "";
  petSearchResults.value = [];
  petSearchPerformed.value = false;
  requestDialogOpen.value = true;
}

function removeOptional(kind: MedicalEncounterSectionKind) {
  encounter.optionalKinds = encounter.optionalKinds.filter((item) => item !== kind);
  delete encounter.texts[kind];
  if (kind === "general-data") encounter.generalData = emptyGeneralDataDraft();
  if (kind === "vaccination") encounter.vaccination = emptyVaccinationDraft(selectedPet.value?.latestConfirmedVaccination);
  if (kind === "therapeutic-appointment") encounter.therapeuticAppointment = emptyTherapeuticAppointmentDraft();
  if (kind === "diagnosis") encounter.diagnosis = emptyDiagnosisDraft();
  if (kind === "laboratory-tests") encounter.laboratoryTests = { studies: [] };
  if (kind === "instrumental-tests") encounter.instrumentalTests = { studies: [] };
}

function requestRemoveOptional(kind: MedicalEncounterSectionKind) {
  sectionDeleteTarget.value = kind;
  sectionDeleteConfirm.value = true;
}

function confirmRemoveOptional() {
  const target = sectionDeleteTarget.value;
  sectionDeleteConfirm.value = false;
  sectionDeleteTarget.value = null;
  if (!target) return;
  removeOptional(target);
}

function resetEncounter() {
  encounter.recordId = "";
  encounter.date = new Date().toISOString().slice(0, 10);
  encounter.selectedIds = [];
  encounter.comment = "";
  encounter.outcomeSelectedIds = [];
  encounter.outcomeComment = "";
  encounter.optionalKinds = [];
  encounter.texts = {};
  encounter.generalData = emptyGeneralDataDraft();
  encounter.vaccination = emptyVaccinationDraft();
  encounter.therapeuticAppointment = emptyTherapeuticAppointmentDraft();
  encounter.diagnosis = emptyDiagnosisDraft();
  encounter.laboratoryTests = { studies: [] };
  encounter.instrumentalTests = { studies: [] };
}

async function saveEncounter() {
  if (!encounter.selectedIds.length || !encounter.outcomeSelectedIds.length) return;
  await perform(async () => {
    const optionalSections: Partial<Record<MedicalEncounterSectionKind, MedicalEncounterSectionInputValue>> = {};
    for (const kind of encounter.optionalKinds) {
      if (kind === "diagnosis") {
        const parsed = parseDiagnosisDraft(encounter.diagnosis);
        if (!parsed.value) throw new Error("Проверьте данные в разделе «Диагноз».");
        optionalSections[kind] = parsed.value;
      } else if (kind === "laboratory-tests" && encounter.texts[kind] === undefined) {
        optionalSections[kind] = normalizeLaboratoryTestsValue(encounter.laboratoryTests);
      } else if (kind === "instrumental-tests" && encounter.texts[kind] === undefined) {
        optionalSections[kind] = normalizeInstrumentalTestsValue(encounter.instrumentalTests);
      } else if (kind === "general-data" && encounter.texts[kind] === undefined) {
        const parsed = parseGeneralDataDraft(encounter.generalData);
        if (!parsed.value) throw new Error("Проверьте показатели в разделе «Общие данные/Габитус».");
        optionalSections[kind] = parsed.value;
      } else if (kind === "vaccination" && encounter.texts[kind] === undefined) {
        const parsed = parseVaccinationDraft(encounter.vaccination);
        if (!parsed.value) throw new Error("Проверьте данные в разделе «Вакцинация/чипирование».");
        optionalSections[kind] = parsed.value;
      } else if (kind === "therapeutic-appointment" && encounter.texts[kind] === undefined) {
        const parsed = parseTherapeuticAppointmentDraft(encounter.therapeuticAppointment);
        if (!parsed.value) throw new Error("Проверьте данные в разделе «Терапевтический приём».");
        optionalSections[kind] = parsed.value;
      } else {
        optionalSections[kind] = { text: encounter.texts[kind] ?? "" };
      }
    }
    const sections = {
      "what-happened": { selectedIds: [...encounter.selectedIds], comment: encounter.comment },
      ...optionalSections,
      outcome: { selectedIds: [...encounter.outcomeSelectedIds], comment: encounter.outcomeComment },
    } as Parameters<ReturnType<typeof requireRepository>["medical"]["saveEncounter"]>[0]["sections"];
    await requireRepository().medical.saveEncounter({
      petId: petId.value,
      encounterDate: encounter.date,
      sections,
      ...(encounter.recordId ? { recordId: encounter.recordId } : {}),
    });
    resetEncounter();
  }, "Запись сохранена.");
}

function editRecord(record: (typeof appState.medical.records)[number]) {
  if (confirmedIds.value.has(record.recordId)) return;
  encounter.recordId = record.recordId;
  encounter.date = record.encounterDate;
  const what = record.sections["what-happened"]?.value;
  encounter.selectedIds = isWhatHappenedValue(what) ? [...what.selectedIds] : [];
  encounter.comment = isWhatHappenedValue(what) ? what.comment : record.text;
  const outcome = record.sections.outcome?.value;
  encounter.outcomeSelectedIds = isOutcomeValue(outcome) ? [...outcome.selectedIds] : [];
  encounter.outcomeComment = isOutcomeValue(outcome) ? outcome.comment : isFreeTextValue(outcome) ? outcome.text : "";
  encounter.optionalKinds = OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => Boolean(record.sections[kind]));
  const generalDataValue = record.sections["general-data"]?.value;
  encounter.generalData = isGeneralDataValue(generalDataValue) ? generalDataDraft(generalDataValue) : emptyGeneralDataDraft();
  const vaccinationValue = record.sections.vaccination?.value;
  encounter.vaccination = isVaccinationValue(vaccinationValue)
    ? vaccinationDraft(vaccinationValue)
    : emptyVaccinationDraft();
  const therapeuticValue = record.sections["therapeutic-appointment"]?.value;
  encounter.therapeuticAppointment = isTherapeuticAppointmentValue(therapeuticValue)
    ? therapeuticAppointmentDraft(therapeuticValue)
    : emptyTherapeuticAppointmentDraft();
  const diagnosisValue = record.sections.diagnosis?.value;
  encounter.diagnosis = isDiagnosisValue(diagnosisValue) ? diagnosisDraft(diagnosisValue) : emptyDiagnosisDraft();
  const laboratoryValue = record.sections["laboratory-tests"]?.value;
  encounter.laboratoryTests = laboratoryValue && typeof laboratoryValue === "object" && "studies" in laboratoryValue
    ? structuredClone(toRaw(laboratoryValue as LaboratoryTestsSectionValue)) : { studies: [] };
  const instrumentalValue = record.sections["instrumental-tests"]?.value;
  encounter.instrumentalTests = instrumentalValue && typeof instrumentalValue === "object" && "studies" in instrumentalValue
    ? structuredClone(toRaw(instrumentalValue as InstrumentalTestsSectionValue)) : { studies: [] };
  encounter.texts = Object.fromEntries(encounter.optionalKinds.flatMap((kind) => {
    const value = record.sections[kind]?.value;
    return kind !== "diagnosis" && isFreeTextValue(value) ? [[kind, value.text]] : [];
  }));
}

function recoverRecordDraft(command: {
  readonly type: string;
  readonly entityId: string;
  readonly payload: unknown;
}): void {
  if (command.type !== "record.create" && command.type !== "record.update") return;
  const payload = command.payload as { input?: Parameters<ReturnType<typeof requireRepository>["medical"]["saveEncounter"]>[0] };
  const input = payload.input;
  if (!input || input.petId !== petId.value) return;
  encounter.recordId = command.type === "record.update" ? command.entityId : "";
  encounter.date = input.encounterDate;
  const what = input.sections["what-happened"];
  encounter.selectedIds = isWhatHappenedValue(what) ? [...what.selectedIds] : [];
  encounter.comment = isWhatHappenedValue(what) ? what.comment : "";
  const outcome = input.sections.outcome;
  encounter.outcomeSelectedIds = isOutcomeValue(outcome) ? [...outcome.selectedIds] : [];
  encounter.outcomeComment = isOutcomeValue(outcome) ? outcome.comment : "";
  encounter.optionalKinds = OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => Boolean(input.sections[kind]));
  const generalDataValue = input.sections["general-data"];
  encounter.generalData = isGeneralDataValue(generalDataValue) ? generalDataDraft(generalDataValue) : emptyGeneralDataDraft();
  const vaccinationValue = input.sections.vaccination;
  encounter.vaccination = isVaccinationValue(vaccinationValue) ? vaccinationDraft(vaccinationValue) : emptyVaccinationDraft();
  const therapeuticValue = input.sections["therapeutic-appointment"];
  encounter.therapeuticAppointment = isTherapeuticAppointmentValue(therapeuticValue)
    ? therapeuticAppointmentDraft(therapeuticValue)
    : emptyTherapeuticAppointmentDraft();
  const diagnosisValue = input.sections.diagnosis;
  encounter.diagnosis = isDiagnosisValue(diagnosisValue) ? diagnosisDraft(diagnosisValue) : emptyDiagnosisDraft();
  const laboratoryValue = input.sections["laboratory-tests"];
  encounter.laboratoryTests = laboratoryValue && typeof laboratoryValue === "object" && "studies" in laboratoryValue
    ? structuredClone(toRaw(laboratoryValue as LaboratoryTestsSectionValue)) : { studies: [] };
  const instrumentalValue = input.sections["instrumental-tests"];
  encounter.instrumentalTests = instrumentalValue && typeof instrumentalValue === "object" && "studies" in instrumentalValue
    ? structuredClone(toRaw(instrumentalValue as InstrumentalTestsSectionValue)) : { studies: [] };
  encounter.texts = Object.fromEntries(encounter.optionalKinds.flatMap((kind) => {
    const value = input.sections[kind];
    return kind !== "diagnosis" && isFreeTextValue(value) ? [[kind, value.text]] : [];
  }));
  alertStore.success("Черновик восстановлен. Проверьте актуальные данные и сохраните его повторно.");
}

function openRecordDelete(record: MedicalRecordDraft) {
  recordDeleteTarget.value = record;
  recordDeleteConfirm.value = true;
}

async function deleteMedicalRecord() {
  const target = recordDeleteTarget.value;
  if (!target) return;
  const succeeded = await perform(
    () => requireRepository().medical.deleteRecord(target.petId, target.recordId),
    "Запись удалена.",
  );
  if (!succeeded) return;
  if (encounter.recordId === target.recordId) resetEncounter();
  recordDeleteConfirm.value = false;
  recordDeleteTarget.value = null;
}

async function findDoctors() {
  doctorSearchPerformed.value = false;
  await performModal(delegationError, async () => {
    const result = await searchDoctorDirectory(doctorQuery.value, 1, 50);
    const existing = new Set(appState.medical.grants.filter((grant) => grant.petId === petId.value && grant.status === "active").map((grant) => grant.granteeAccountId));
    doctors.value = result.items.filter((doctor) => doctor.accountId !== appState.session.accountId && !existing.has(doctor.accountId));
    doctorSearchPerformed.value = true;
  }, "Не удалось найти врача.");
}

function openDelegationDialog() {
  delegationError.value = "";
  doctorQuery.value = "";
  doctors.value = [];
  doctorSearchPerformed.value = false;
  delegationTarget.value = null;
  delegationDelegate.value = false;
  delegationDialogOpen.value = true;
}

async function delegate() {
  if (!delegationTarget.value || !selectedGrant.value) return;
  const target = delegationTarget.value;
  const parentGrant = selectedGrant.value;
  const selectedPetId = petId.value;
  const actions: PetGrantAction[] = parentGrant.actions.filter((action) => action !== "delegate");
  if (delegationDelegate.value && parentGrant.actions.includes("delegate")) actions.push("delegate");
  delegationConfirm.value = false;
  delegationDialogOpen.value = false;
  await perform(async () => {
    const currentTarget = (await searchDoctorDirectory(target.accountId, 1, 50, "id")).items
      .find((doctor) => doctor.accountId === target.accountId);
    if (!currentTarget) throw new Error("Выбранный врач больше недоступен для предоставления доступа.");
    await requireRepository().medical.delegateGrant(
      parentGrant.grantId,
      currentTarget.accountId,
      actions,
      { granteeDisplayName: currentTarget.displayName },
    );
    await router.push({ path: `/doctor/pets/${selectedPetId}`, query: { grantId: parentGrant.grantId } });
  }, "Доступ делегирован.");
}

function openSelectedPetRelinquish() {
  if (!selectedPet.value || !selectedGrant.value) return;
  void openRelinquish({
    petId: selectedPet.value.petId,
    name: selectedPet.value.name,
    grantId: selectedGrant.value.grantId,
  });
}

async function requireCurrentGrantedAccess(petId: string, grantId: string): Promise<void> {
  const current = (await loadDoctorPetAccesses(petId, "granted", 1, 50, "owner", "asc")).items
    .find((access) => access.petId === petId && access.grantId === grantId && access.status === "granted");
  if (!current) {
    throw new Error("Статус доступа изменился. Обновите список перед повторной попыткой.");
  }
}

async function openRelinquish(pet: Pick<DirectoryPetDto, "petId" | "name"> & { grantId?: string }) {
  busy.value = true;
  alertStore.clear();
  try {
    if (!pet.grantId) throw new Error("Идентификатор доступа ещё не синхронизирован. Обновите список.");
    await requireCurrentGrantedAccess(pet.petId, pet.grantId);
    const medical = requireRepository().medical;
    await medical.refresh();
    const grant = appState.medical.grants.find((candidate) => candidate.grantId === pet.grantId);
    if (!grant || grant.petId !== pet.petId || grant.granteeAccountId !== appState.session.accountId ||
      !localGrantEffectivelyActive(grant.grantId)) {
      throw new Error("Данные доступа изменились или доступ уже закрыт. Обновите список и повторите попытку.");
    }
    relinquishTarget.value = { petId: pet.petId, petName: pet.name, grantId: grant.grantId };
    relinquishConfirm.value = true;
  } catch (reason) {
    alertStore.error(reason, "Не удалось проверить доступ.");
  } finally {
    busy.value = false;
  }
}

async function relinquish() {
  const target = relinquishTarget.value;
  if (!target) return;
  const succeeded = await perform(async () => {
    await requireCurrentGrantedAccess(target.petId, target.grantId);
    await requireRepository().medical.relinquishAccess(target.grantId);
  });
  if (!succeeded) return;
  await refreshAccesses();
  alertStore.success(`Вы отказались от доступа к медицинской карте ${target.petName}.`);
  relinquishConfirm.value = false;
  relinquishTarget.value = null;
  if (route.path !== "/doctor/home") await router.replace("/doctor/home");
}

watch([homeQuery, homeFilter, homeSort, homeSortDirection, homePage, homePageSize], (current, previous) => {
  localStorage.setItem("klinok:doctor-pets-page-size", String(homePageSize.value));
  const resetPage = previous && current.some((value, index) => index !== 4 && value !== previous[index]);
  if (resetPage && homePage.value !== 1) {
    homePage.value = 1;
    return;
  }
  void refreshAccesses();
}, { immediate: true });
watch(petId, (id) => { void refreshSelectedDirectoryPet(id); }, { immediate: true });
let recoveredOperationId = "";
watch(
  [() => route.query.recover, () => appState.syncNotifications],
  ([notificationId, notifications]) => {
    if (typeof notificationId !== "string") return;
    const notification = notifications.find((item) => item.notificationId === notificationId);
    if (!notification?.localDraft || notification.operationId === recoveredOperationId) return;
    if (notification.localDraft.type !== "record.create" && notification.localDraft.type !== "record.update") return;
    recoveredOperationId = notification.operationId;
    recoverRecordDraft(notification.localDraft);
  },
  { immediate: true },
);
watch(() => props.scenarioId, (scenarioId) => {
  if (scenarioId === "doctor-pet-request-access") openRequestDialog();
});
watch(requestDialogOpen, (open) => {
  if (!open && props.scenarioId === "doctor-pet-request-access") void router.replace("/doctor/home");
});
watch([historyQuery, historyFrom, historyTo, historySection, historyStatus, historySort, historyPageSize], () => { historyPage.value = 1; });
watch([petId, epicrisisPageSize], () => { epicrisisPage.value = 1; });
watch(epicrisisPageCount, (pageCount) => {
  if (epicrisisPage.value > pageCount) epicrisisPage.value = pageCount;
});
watch([petId, delegationPageSize], () => { delegationPage.value = 1; });
watch(delegationPageCount, (pageCount) => {
  if (delegationPage.value > pageCount) delegationPage.value = pageCount;
});
</script>

<template>
  <WorkspaceShell role="doctor" title="Кабинет врача" :profile-name="profileName" @sign-out="signOut">
    <section v-if="scenarioId === 'doctor-home' || scenarioId === 'doctor-pet-request-access'" class="panel doctor-page">
      <div class="doctor-heading doctor-access-heading">
        <h2>Доступ к медицинским картам</h2>
        <button
          class="primary-action inline owner-profile-action"
          type="button"
          title="Запросить доступ"
          aria-label="Запросить доступ"
          @click="openRequestDialog"
        >
          <AppIcon name="plus" />
        </button>
      </div>
      <div class="doctor-access-filters">
        <label class="doctor-access-global-filter">
          <span>Показывать</span>
          <AppSelect :model-value="homeFilter" :options="homeFilterOptions" aria-label="Показывать" @update:model-value="updateHomeFilter" />
        </label>
        <label class="administrator-search">
          <span>ФИО владельца, кличка, вид или полный идентификатор</span>
          <span class="administrator-search-control">
            <AppIcon name="search" />
            <input v-model="homeQuery" type="search" placeholder="Поиск" />
          </span>
        </label>
      </div>
      <div class="owner-access-table-wrap">
        <table class="owner-access-table doctor-access-table">
          <colgroup>
            <col class="doctor-access-pet-column" />
            <col class="doctor-access-owner-column" />
            <col class="doctor-access-status-column" />
            <col class="doctor-access-delegation-column" />
          </colgroup>
          <thead>
            <tr>
              <th :aria-sort="homeSortAria('pet')">
                <button class="doctor-sort-button" type="button" @click="changeHomeSort('pet')">
                  Питомец
                  <AppIcon name="chevron-down" :class="{ descending: homeSort === 'pet' && homeSortDirection === 'desc' }" />
                </button>
              </th>
              <th :aria-sort="homeSortAria('owner')">
                <button class="doctor-sort-button" type="button" @click="changeHomeSort('owner')">
                  Владелец
                  <AppIcon name="chevron-down" :class="{ descending: homeSort === 'owner' && homeSortDirection === 'desc' }" />
                </button>
              </th>
              <th>Доступ</th>
              <th>Делегирование</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in homeRows" :key="row.grantId || row.requestId || `${row.petId}:${row.status}`">
              <td class="owner-access-doctor doctor-access-pet" data-label="Питомец">
                <div class="owner-access-controlled">
                  <div class="doctor-access-pet-identity">
                    <RouterLink
                      v-if="row.status === 'granted' && row.actionable"
                      class="doctor-access-pet-link"
                      :to="{ path: `/doctor/pets/${row.petId}`, query: { grantId: row.grantId } }"
                    >
                      <strong>{{ [row.species, row.name].filter(Boolean).join(' ') }}</strong>
                    </RouterLink>
                    <strong v-else>{{ [row.species, row.name].filter(Boolean).join(' ') }}</strong>
                    <small>{{ row.petId }}</small>
                    <small v-if="(row.status === 'granted' || row.status === 'requested') && !row.actionable">Данные обновляются…</small>
                  </div>
                  <div v-if="row.status === 'granted' && row.actionable" class="row-actions">
                    <RouterLink
                      class="primary-action inline access-icon-action"
                      :to="{ path: `/doctor/pets/${row.petId}`, query: { grantId: row.grantId } }"
                      title="Открыть медицинскую карту"
                      aria-label="Открыть медицинскую карту"
                    >
                      <AppIcon name="eye" />
                    </RouterLink>
                  </div>
                </div>
              </td>
              <td class="owner-access-doctor" data-label="Владелец">
                <PersonIdentity :display-name="row.ownerDisplayName" :account-id="row.ownerAccountId" />
              </td>
              <td data-label="Доступ">
                <AccessStatusField :status="row.status">
                  <button
                    v-if="row.status === 'requested' && row.requestId && row.actionable"
                    class="outline-action inline danger-outline access-icon-action"
                    type="button"
                    :disabled="busy"
                    title="Отозвать запрос на доступ"
                    aria-label="Отозвать запрос на доступ"
                    @click="cancelPendingRequest(row.petId, row.requestId)"
                  >
                    <AppIcon name="close" />
                  </button>
                  <button
                    v-else-if="row.status === 'granted' && row.grantId && row.actionable"
                    class="outline-action inline danger-outline access-icon-action"
                    type="button"
                    :disabled="busy"
                    title="Отказаться от доступа"
                    aria-label="Отказаться от доступа"
                    @click="openRelinquish(row)"
                  >
                    <AppIcon name="close" />
                  </button>
                </AccessStatusField>
              </td>
              <td
                :class="{ 'is-empty': row.status !== 'granted' }"
                data-label="Делегирование"
              >
                <AccessStatusField
                  :status="row.status"
                  kind="delegation"
                  :delegation-allowed="row.permissions?.includes('delegate')"
                >
                  <RouterLink
                    v-if="row.status === 'granted' && row.actionable && row.permissions?.includes('delegate')"
                    class="outline-action inline access-icon-action"
                    :to="{ path: `/doctor/pets/${row.petId}/delegate`, query: { grantId: row.grantId } }"
                    title="Делегировать доступ"
                    aria-label="Делегировать доступ"
                  >
                    <AppIcon name="share" />
                  </RouterLink>
                </AccessStatusField>
              </td>
            </tr>
            <tr v-if="!homeRows.length">
              <td class="doctor-access-empty" colspan="4">Доступы по выбранным условиям не найдены.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPaginator
        v-model:page="homePage"
        v-model:page-size="homePageSize"
        class="doctor-access-pagination"
        :total-items="homeTotal"
        :page-sizes="pageSizes"
        page-size-label="Строк на странице"
        aria-label="Навигация по доступам"
      />

      <ModalDialog v-model="requestDialogOpen" title="Запросить доступ" :busy="busy">
        <div class="form-stack grant-access-form doctor-request-access-form">
          <p v-if="requestError" class="form-alert error" role="alert">{{ requestError }}</p>
          <form class="form-stack doctor-request-search-form" @submit.prevent="findPets">
            <label class="doctor-request-owner-field"><span>ФИО владельца, его часть или полный идентификатор (необязательно при поиске по полному идентификатору питомца)</span><input v-model="petOwnerQuery" type="search" /></label>
            <label class="doctor-request-pet-field"><span>Кличка, её часть или полный идентификатор питомца</span><input v-model="petNameQuery" type="search" required /></label>
            <button class="primary-action inline access-icon-action doctor-request-search-action" type="submit" :disabled="busy" :title="busy ? 'Поиск питомца…' : 'Найти питомца'" :aria-label="busy ? 'Поиск питомца…' : 'Найти питомца'"><AppIcon name="search" /></button>
          </form>
          <div v-for="pet in petSearchResults" :key="pet.petId" class="list-row doctor-request-result">
            <div><strong>{{ pet.species }} {{ pet.name }}</strong><small>{{ pet.petId }}</small><PersonIdentity :display-name="pet.ownerDisplayName" :account-id="pet.ownerAccountId" /></div>
            <button class="primary-action inline access-icon-action" type="button" :disabled="busy" title="Отправить запрос" aria-label="Отправить запрос" @click="requestAccess(pet)"><AppIcon name="check" /></button>
          </div>
          <p v-if="petSearchPerformed && !petSearchResults.length">Питомцы не найдены.</p>
          <div class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Закрыть" aria-label="Закрыть" @click="requestDialogOpen = false"><AppIcon name="close" /></button></div>
        </div>
      </ModalDialog>
    </section>

    <section v-else-if="selectedPet && scenarioId === 'doctor-pet-detail'" class="doctor-page doctor-pet-detail">
      <PetProfileView
        :pet="selectedPet"
        :owner-display-name="currentDirectoryPet?.ownerDisplayName || selectedPet.ownerAccountId"
        :owner-account-id="currentDirectoryPet?.ownerAccountId || selectedPet.ownerAccountId"
      >
        <template #actions>
          <RouterLink
            class="outline-action inline owner-profile-action"
            to="/doctor/home"
            title="Назад к медицинским картам"
            aria-label="Назад к медицинским картам"
          >
            <AppIcon name="chevron-left" />
          </RouterLink>
          <RouterLink v-if="canDelegate" class="outline-action inline owner-profile-action" :to="{ path: `/doctor/pets/${petId}/delegate`, query: { grantId: selectedGrant?.grantId } }" title="Делегировать доступ" aria-label="Делегировать доступ"><AppIcon name="share" /></RouterLink>
          <button v-if="selectedGrant" class="outline-action inline danger-outline owner-profile-action" type="button" title="Отказаться от доступа" aria-label="Отказаться от доступа" @click="openSelectedPetRelinquish"><AppIcon name="close" /></button>
        </template>
      </PetProfileView>

      <EpicrisisTable
        v-model:page="epicrisisPage"
        v-model:page-size="epicrisisPageSize"
        :records="epicrisisRecords"
        :page-sizes="pageSizes"
        heading-id="doctor-epicrisis-heading"
        @activate="openMedicalRecord"
      />

      <article v-if="canWrite && !encounter.recordId" class="panel encounter-editor">
        <EncounterEditorForm
          v-model:date="encounter.date"
          v-model:selected-ids="encounter.selectedIds"
          v-model:comment="encounter.comment"
          v-model:outcome-selected-ids="encounter.outcomeSelectedIds"
          v-model:outcome-comment="encounter.outcomeComment"
          v-model:optional-kinds="encounter.optionalKinds"
          v-model:texts="encounter.texts"
          v-model:general-data="encounter.generalData"
          v-model:vaccination="encounter.vaccination"
          v-model:therapeutic-appointment="encounter.therapeuticAppointment"
          v-model:diagnosis="encounter.diagnosis"
          v-model:laboratory-tests="encounter.laboratoryTests"
          v-model:instrumental-tests="encounter.instrumentalTests"
          :busy="busy"
          :editing="false"
          :latest-confirmed-vaccination="selectedPet.latestConfirmedVaccination"
          :pet-birth-date="selectedPet.birthDate"
          @save="saveEncounter"
          @remove-section="requestRemoveOptional"
        />
      </article>
      <article v-else-if="!canWrite" class="panel"><p>Доступ только для чтения: создание и изменение приёмов недоступно.</p></article>

      <LaboratoryComparison :records="petRecords" :confirmed-ids="confirmedIds" />

      <article class="panel doctor-medical-record">
        <h2>Медицинская карта</h2>
        <div v-if="!encounter.recordId" class="doctor-history-filters">
          <input v-model="historyQuery" type="search" placeholder="Содержание или автор" aria-label="Поиск по истории" />
          <label class="doctor-history-date-filter"><span>Дата с</span><input v-model="historyFrom" type="date" /></label>
          <label class="doctor-history-date-filter"><span>Дата по</span><input v-model="historyTo" type="date" /></label>
          <AppSelect :model-value="historySection" :options="historySectionOptions" aria-label="Раздел" @update:model-value="updateHistorySection" />
          <AppSelect :model-value="historyStatus" :options="historyStatusOptions" aria-label="Статус" @update:model-value="updateHistoryStatus" />
          <AppSelect :model-value="historySort" :options="historySortOptions" aria-label="Порядок" @update:model-value="updateHistorySort" />
        </div>
        <MedicalRecordEntry
          v-for="record in pagedRecords"
          :key="record.recordId"
          :record="record"
          mode="details"
          :confirmed="confirmedIds.has(record.recordId)"
          :action="canWrite ? 'edit' : 'none'"
          :editing="encounter.recordId === record.recordId"
          @edit="editRecord"
          @delete="openRecordDelete"
        >
          <template #editor>
            <div class="encounter-editor encounter-editor-inline">
              <EncounterEditorForm
                v-model:date="encounter.date"
                v-model:selected-ids="encounter.selectedIds"
                v-model:comment="encounter.comment"
                v-model:outcome-selected-ids="encounter.outcomeSelectedIds"
                v-model:outcome-comment="encounter.outcomeComment"
                v-model:optional-kinds="encounter.optionalKinds"
                v-model:texts="encounter.texts"
                v-model:general-data="encounter.generalData"
                v-model:vaccination="encounter.vaccination"
                v-model:therapeutic-appointment="encounter.therapeuticAppointment"
                v-model:diagnosis="encounter.diagnosis"
                v-model:laboratory-tests="encounter.laboratoryTests"
                v-model:instrumental-tests="encounter.instrumentalTests"
                :busy="busy"
                editing
                :latest-confirmed-vaccination="selectedPet.latestConfirmedVaccination"
                :pet-birth-date="selectedPet.birthDate"
                @save="saveEncounter"
                @cancel="resetEncounter"
                @remove-section="requestRemoveOptional"
              />
            </div>
          </template>
        </MedicalRecordEntry>
        <AppPaginator
          v-if="filteredRecords.length"
          v-model:page="historyPage"
          v-model:page-size="historyPageSize"
          :total-items="filteredRecords.length"
          :page-sizes="pageSizes"
          page-size-label="Записей на странице"
          aria-label="Навигация по медицинским записям"
        />
      </article>
    </section>

    <PetAccessManager
      v-else-if="selectedPet && scenarioId === 'doctor-pet-delegate'"
      v-model:page="delegationPage"
      v-model:page-size="delegationPageSize"
      :pet="selectedPet"
      :rows="delegatedAccessRows"
      :page-sizes="pageSizes"
      :owner-display-name="currentDirectoryPet?.ownerDisplayName || selectedPet.ownerAccountId"
      :owner-account-id="currentDirectoryPet?.ownerAccountId || selectedPet.ownerAccountId"
      :can-add="canDelegate"
      add-label="Делегировать доступ"
      empty-message="Делегированные доступы отсутствуют."
      @add="openDelegationDialog"
    >
      <template #headerActions>
        <RouterLink class="outline-action inline owner-profile-action" :to="{ path: `/doctor/pets/${selectedPet.petId}`, query: { grantId: selectedGrant?.grantId } }" title="Назад к медицинской карте" aria-label="Назад к медицинской карте"><AppIcon name="chevron-left" /></RouterLink>
      </template>
      <p v-if="!canDelegate" class="form-alert error">Текущий доступ не разрешает делегирование.</p>
      <ModalDialog v-model="delegationDialogOpen" title="Делегировать доступ" :busy="busy">
        <div class="form-stack grant-access-form">
          <p v-if="delegationError" class="form-alert error" role="alert">{{ delegationError }}</p>
          <form class="form-stack grant-search-form" @submit.prevent="findDoctors">
            <label><span>ФИО врача, его часть или полный идентификатор</span><input v-model="doctorQuery" required /></label>
            <button class="primary-action inline access-icon-action grant-search-action" type="submit" :disabled="busy" :title="busy ? 'Поиск врача…' : 'Найти врача'" :aria-label="busy ? 'Поиск врача…' : 'Найти врача'"><AppIcon name="search" /></button>
          </form>
          <div v-for="doctor in doctors" :key="doctor.accountId" class="list-row"><PersonIdentity :display-name="doctor.displayName" :account-id="doctor.accountId" /><button class="outline-action inline access-icon-action" type="button" title="Выбрать врача" aria-label="Выбрать врача" @click="delegationTarget = doctor"><AppIcon name="check" /></button></div>
          <p v-if="doctorSearchPerformed && !doctors.length">Врачи не найдены.</p>
          <form v-if="delegationTarget" class="form-stack" @submit.prevent="delegationConfirm = true">
            <strong>Выбран врач: {{ delegationTarget.displayName }}</strong>
            <label v-if="selectedGrant?.actions.includes('delegate')" class="check-row"><input v-model="delegationDelegate" type="checkbox" /><span>Разрешить дальнейшее делегирование</span></label>
            <div class="confirmation-dialog-actions">
              <button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Отмена" aria-label="Отмена" @click="delegationDialogOpen = false"><AppIcon name="close" /></button>
              <button class="primary-action inline access-icon-action" type="submit" :disabled="busy" title="Делегировать доступ" aria-label="Делегировать доступ"><AppIcon name="check" /></button>
            </div>
          </form>
          <div v-else class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Отмена" aria-label="Отмена" @click="delegationDialogOpen = false"><AppIcon name="close" /></button></div>
        </div>
      </ModalDialog>
    </PetAccessManager>

    <section v-else class="owner-empty-state"><p>Питомец недоступен или данные ещё не синхронизированы.</p><RouterLink class="primary-action inline" to="/doctor/home">На главную</RouterLink></section>

    <ConfirmationDialog v-model="delegationConfirm" title="Подтвердить делегирование?" description="Выбранный врач получит доступ к медицинской карте." confirm-label="Делегировать" @confirm="delegate" />
    <ConfirmationDialog v-model="relinquishConfirm" title="Отказаться от доступа?" :description="relinquishDescription" confirm-label="Отказаться" :busy="busy" @confirm="relinquish" />
    <ConfirmationDialog v-model="recordDeleteConfirm" title="Удалить запись?" description="Неподтверждённая запись будет удалена без возможности восстановления." confirm-label="Удалить запись" :busy="busy" @confirm="deleteMedicalRecord" />
    <ConfirmationDialog v-model="sectionDeleteConfirm" title="Удалить раздел?" :description="sectionDeleteDescription" confirm-label="Удалить раздел" @confirm="confirmRemoveOptional" />
  </WorkspaceShell>
</template>
