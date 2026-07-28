// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PersonIdentity from "../src/components/PersonIdentity.vue";

describe("PersonIdentity", () => {
  it("always renders the account ID on the line after the display name", () => {
    const wrapper = mount(PersonIdentity, {
      props: {
        displayName: "Анна Ивановна Врач",
        accountId: "doctor-1",
      },
      slots: {
        idActions: '<button title="Копировать" aria-label="Копировать">К</button>',
      },
    });

    expect(wrapper.element.children[0]).toBe(wrapper.get(".person-identity-name").element);
    expect(wrapper.element.children[1]).toBe(wrapper.get(".person-identity-id-row").element);
    expect(wrapper.get(".person-identity-name").text()).toBe("Анна Ивановна Врач");
    expect(wrapper.get(".person-identity-id").text()).toBe("doctor-1");
    expect(wrapper.get(".person-identity-id-row button").attributes("aria-label")).toBe("Копировать");
  });
});
