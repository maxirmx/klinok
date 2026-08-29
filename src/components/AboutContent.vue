<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import BrandLogo from "./BrandLogo.vue";
import { APP_VERSION } from "../version";

withDefaults(defineProps<{ headingTag?: "h1" | "h2" }>(), {
  headingTag: "h2",
});

const technicalContributors = [
  "Яшина Полина Алексеевна",
  "Радевич Мария Александровна",
  "Шпиньков Дмитрий Владимирович",
  "Шкловская Полина Евгеньевна",
  "Назаренко Елена Алексеевна",
  "Имберт Габриэла Сергеевна",
] as const;

const sponsors = [
  { name: "Никольская Наталья" },
  { name: "Букреев Михаил" },
  { name: "Маликов Иван Андреевич", description: "ведущий, блогер, инфлюенсер" },
  { name: "Павлова Екатерина Андреевна" },
  { name: "Строкова Евгения Александровна" },
  { name: "Порада Тамара Вячеславовна" },
] as const;
</script>

<template>
  <article class="about-page" aria-labelledby="about-page-title">
    <header class="about-hero">
      <BrandLogo variant="full" size="standard" />
      <div>
        <component :is="headingTag" id="about-page-title">О программе</component>
        <p class="about-version">Версия {{ APP_VERSION }}</p>
      </div>
    </header>

    <div class="about-sections">
      <section class="about-card">
        <h3>Идея</h3>
        <p class="about-person">Порада Вячеслав</p>
      </section>

      <section class="about-card">
        <h3>Дизайн логотипа</h3>
        <p class="about-person">
          <a href="https://www.behance.net/korolevichmaria" target="_blank" rel="noopener noreferrer">
            Королевич Мария Кирилловна
          </a>
        </p>
      </section>

      <section class="about-card">
        <h3>Разработка программы</h3>
        <p class="about-person">
          <a href="https://www.sw.consulting" target="_blank" rel="noopener noreferrer">
            Самсонов Максим Станиславович
          </a>
        </p>
      </section>

      <section class="about-card">
        <h3>Техническая помощь</h3>
        <ul class="about-people-list">
          <li v-for="contributor in technicalContributors" :key="contributor">{{ contributor }}</li>
        </ul>
      </section>

      <section class="about-card about-sponsors">
        <h3>Спонсоры</h3>
        <ul class="about-people-list">
          <li v-for="sponsor in sponsors" :key="sponsor.name">
            <span>{{ sponsor.name }}</span>
            <small v-if="'description' in sponsor">{{ sponsor.description }}</small>
          </li>
        </ul>
      </section>
    </div>
  </article>
</template>
