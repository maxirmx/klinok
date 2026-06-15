// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, reactive, ref } from "vue";
import {
  analyses,
  defaultAnalysis,
  defaultAppointment,
  pets,
  roles,
  visits,
  type AnalysisDraft,
  type AppointmentDraft,
  type Pet,
  type Role,
  type Visit,
} from "./data";

export const selectedRole = ref<Role>("owner");
export const phone = ref("+7 (900) 000-00-00");
export const otp = reactive(["4", "4", "4", "4"]);
export const darkMode = ref(false);
export const petQuery = ref("");
export const selectedType = ref<Pet["species"] | "Все">("Все");
export const selectedSex = ref<Pet["sex"] | "Все">("Все");
export const appointment = reactive<AppointmentDraft>({ ...defaultAppointment });
export const analysisDraft = reactive<AnalysisDraft>({ ...defaultAnalysis, rows: [...defaultAnalysis.rows] });
export const localVisits = ref<Visit[]>([...visits]);
export const savedAnalyses = ref<AnalysisDraft[]>([...analyses]);
export const toast = ref("");

export const selectedRoleLabel = computed(() => {
  return roles.find((role) => role.id === selectedRole.value)?.label ?? "";
});

export const filteredPets = computed(() => {
  const query = petQuery.value.trim().toLowerCase();
  return pets.filter((pet) => {
    const typeMatches = selectedType.value === "Все" || pet.species === selectedType.value;
    const sexMatches = selectedSex.value === "Все" || pet.sex === selectedSex.value;
    const queryMatches = !query || `${pet.name} ${pet.breed}`.toLowerCase().includes(query);
    return typeMatches && sexMatches && queryMatches;
  });
});

export function applyPetFilters(type: Pet["species"] | "Все", sex: Pet["sex"] | "Все") {
  selectedType.value = type;
  selectedSex.value = sex;
}

export function submitAppointment() {
  const id = 22138 + localVisits.value.length;
  localVisits.value = [
    {
      id,
      title: `Заявка #${id}`,
      complaint: appointment.reason,
      doctor: appointment.doctor,
      role: "Откликнувшиеся врачи",
      pet: appointment.pet,
      date: appointment.date,
      tag: appointment.urgency,
      diagnosis: "Ожидает первичного приема",
      recommendation: "Дождитесь отклика врача или выберите специалиста из списка.",
    },
    ...localVisits.value,
  ];
  return id;
}

export function saveAnalysisDraft() {
  savedAnalyses.value = [
    {
      pet: analysisDraft.pet,
      templateId: analysisDraft.templateId,
      date: analysisDraft.date,
      rows: [...analysisDraft.rows],
    },
    ...savedAnalyses.value,
  ];
}

export function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 1800);
}
