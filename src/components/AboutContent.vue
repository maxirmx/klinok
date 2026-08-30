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
  "Имберт Габриэла Сергеевна",
  "Назаренко Елена Алексеевна",
  "Радевич Мария Александровна",
  "Шкловская Полина Евгеньевна",
  "Шпиньков Дмитрий Владимирович",
  "Яшина Полина Алексеевна",
] as const;

const sponsors = [
  { name: "Букреев Михаил" },
  { name: "Елкина Таисия Сергеевна" },
  { name: "Маликов Иван Андреевич", description: "ведущий, блогер, инфлюенсер" },
  { name: "Никольская Наталья" },
  { name: "Павлова Екатерина Андреевна" },
  { name: "Порада Тамара Вячеславовна" },
  { name: "Пузырко Тимур" },
  { name: "Пущин Владимир" },
  { name: "Строкова Евгения Александровна" }
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
