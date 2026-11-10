# Phase 0 dependency advisory review

Registry snapshots taken November 10, 2026. npm audit exited 1 for both the full and production-only trees. The original production audit reported 11 package findings with two critical. After pinning jsPDF 4.2.1 and jsPDF-AutoTable 5.0.9, the production tree reported eight findings with zero critical, six high and two moderate. The full tree reported 16 package findings with one critical, 11 high and four moderate. Counts are affected packages, and may include a parent affected through a child.

## Full updated tree

| Package | Locked affected path and version | Advisory ranges | npm-reported fix |
| --- | --- | --- | --- |
| @humanfs/node | `node_modules/@humanfs/node` @ 0.16.7 | [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g) <0.16.8 | Compatible npm remediation reported |
| ajv | `node_modules/ajv` @ 6.12.6 | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) <6.14.0 | Compatible npm remediation reported |
| brace-expansion | `node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion` @ 2.0.2<br>`node_modules/brace-expansion` @ 1.1.12 | [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) <1.1.13<br>[GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) >=2.0.0 <2.0.3<br>[GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) >=2.0.0 <2.1.2<br>[GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) <1.1.16<br>[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) <1.1.17<br>[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) >=2.0.0 <2.1.3<br>[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) >=2.0.0 <2.1.4<br>[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) <1.1.18<br>[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) <1.1.21<br>[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) >=2.0.0 <2.1.7<br>[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) <1.1.20<br>[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) >=2.0.0 <2.1.6<br>[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) <1.1.19<br>[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) >=2.0.0 <2.1.5 | Compatible npm remediation reported |
| fflate | `node_modules/fflate` @ 0.8.2 | [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) >=0.8.0 <0.8.3 | Compatible npm remediation reported |
| flatted | `node_modules/flatted` @ 3.3.3 | [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f) <3.4.0<br>[GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) <=3.4.1 | Compatible npm remediation reported |
| js-yaml | `node_modules/js-yaml` @ 4.1.0 | [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m) >=4.0.0 <4.1.1<br>[GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) >=4.0.0 <=4.1.1<br>[GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) >=4.0.0 <4.3.0<br>[GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) >=4.0.0 <4.3.1<br>[GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) >=4.0.0 <4.3.2 | Compatible npm remediation reported |
| minimatch | `node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch` @ 9.0.5<br>`node_modules/minimatch` @ 3.1.2 | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) <3.1.3<br>[GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) >=9.0.0 <9.0.6<br>[GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) <3.1.3<br>[GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj) >=9.0.0 <9.0.7<br>[GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) <3.1.4<br>[GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) >=9.0.0 <9.0.7<br>[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) >=7.0.0 <11.0.1 | Compatible npm remediation reported |
| mongoose | `node_modules/mongoose` @ 8.18.2 | [GHSA-wpg9-53fq-2r8h](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) >=8.0.0 <=8.22.0<br>[GHSA-664h-wqgq-64gw](https://github.com/advisories/GHSA-664h-wqgq-64gw) >=8.0.0 <8.24.1 | Compatible npm remediation reported |
| nanoid | `node_modules/nanoid` @ 3.3.11 | [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv) <3.3.16<br>[GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) <3.3.18<br>[GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) <3.3.12 | Compatible npm remediation reported |
| next | `node_modules/next` @ 15.5.29 | Through `postcss` | next 16.4.6 (major) |
| picomatch | `node_modules/picomatch` @ 2.3.1<br>`node_modules/tinyglobby/node_modules/picomatch` @ 4.0.3 | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) <2.3.2<br>[GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p) >=4.0.0 <4.0.4<br>[GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) <2.3.2<br>[GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) >=4.0.0 <4.0.4 | Compatible npm remediation reported |
| postcss | `node_modules/next/node_modules/postcss` @ 8.4.31<br>`node_modules/postcss` @ 8.5.6 | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) <8.5.10<br>[GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) <=8.5.11<br>[GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) <=8.5.22<br>[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) <=8.5.17 | next 16.4.6 (major) |
| sharp | `node_modules/sharp` @ 0.34.4 | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) <0.35.0<br>[GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) <0.35.4<br>[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) <0.35.5 | Compatible npm remediation reported |
| source-map-js | `node_modules/source-map-js` @ 1.2.1 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) >=1.0.0 <1.2.2 | Compatible npm remediation reported |
| tar | `node_modules/tar` @ 7.5.1 | [GHSA-29xp-372q-xqph](https://github.com/advisories/GHSA-29xp-372q-xqph) =7.5.1<br>[GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v) <7.5.7<br>[GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) <=7.5.2<br>[GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx) <7.5.8<br>[GHSA-qffp-2rhf-9h96](https://github.com/advisories/GHSA-qffp-2rhf-9h96) <=7.5.9<br>[GHSA-9ppj-qmqm-q256](https://github.com/advisories/GHSA-9ppj-qmqm-q256) <=7.5.10<br>[GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w) <=7.5.3<br>[GHSA-vmf3-w455-68vh](https://github.com/advisories/GHSA-vmf3-w455-68vh) <=7.5.15<br>[GHSA-w8wr-v893-vjvp](https://github.com/advisories/GHSA-w8wr-v893-vjvp) <=7.5.17<br>[GHSA-23hp-3jrh-7fpw](https://github.com/advisories/GHSA-23hp-3jrh-7fpw) <=7.5.18<br>[GHSA-8x88-c5mf-7j5w](https://github.com/advisories/GHSA-8x88-c5mf-7j5w) <=7.5.17<br>[GHSA-gvwx-54wh-qm9j](https://github.com/advisories/GHSA-gvwx-54wh-qm9j) <=7.5.16<br>[GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m) <=7.5.20 | Compatible npm remediation reported |
| zod | `node_modules/zod` @ 4.1.12 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) <4.6.6 | Compatible npm remediation reported |

## PDF findings removed by the upgrade

| Prior package | Advisory range or dependency |
| --- | --- |
| dompurify | [GHSA-v2wj-7wpq-c8vv](https://github.com/advisories/GHSA-v2wj-7wpq-c8vv) >=3.1.3 <=3.3.1 |
| dompurify | [GHSA-h7mw-gpvr-xq4m](https://github.com/advisories/GHSA-h7mw-gpvr-xq4m) <3.4.0 |
| dompurify | [GHSA-crv5-9vww-q3g8](https://github.com/advisories/GHSA-crv5-9vww-q3g8) >=1.0.10 <3.4.0 |
| dompurify | [GHSA-v9jr-rg53-9pgp](https://github.com/advisories/GHSA-v9jr-rg53-9pgp) >=3.0.1 <3.4.0 |
| dompurify | [GHSA-hpcv-96wg-7vj8](https://github.com/advisories/GHSA-hpcv-96wg-7vj8) <=3.4.5 |
| dompurify | [GHSA-r47g-fvhr-h676](https://github.com/advisories/GHSA-r47g-fvhr-h676) <=3.4.5 |
| dompurify | [GHSA-rp9w-3fw7-7cwq](https://github.com/advisories/GHSA-rp9w-3fw7-7cwq) <=3.4.6 |
| dompurify | [GHSA-cmwh-pvxp-8882](https://github.com/advisories/GHSA-cmwh-pvxp-8882) <=3.4.10 |
| dompurify | [GHSA-vxr8-fq34-vvx9](https://github.com/advisories/GHSA-vxr8-fq34-vvx9) <3.4.9 |
| dompurify | [GHSA-gvmj-g25r-r7wr](https://github.com/advisories/GHSA-gvmj-g25r-r7wr) >=3.0.0 <=3.4.7 |
| dompurify | [GHSA-x4vx-rjvf-j5p4](https://github.com/advisories/GHSA-x4vx-rjvf-j5p4) <=3.4.6 |
| dompurify | [GHSA-76mc-f452-cxcm](https://github.com/advisories/GHSA-76mc-f452-cxcm) <3.4.7 |
| dompurify | [GHSA-39q2-94rc-95cp](https://github.com/advisories/GHSA-39q2-94rc-95cp) <=3.3.3 |
| dompurify | [GHSA-cjmm-f4jc-qw8r](https://github.com/advisories/GHSA-cjmm-f4jc-qw8r) <=3.3.1 |
| dompurify | [GHSA-cj63-jhhr-wcxv](https://github.com/advisories/GHSA-cj63-jhhr-wcxv) <=3.3.1 |
| dompurify | [GHSA-h8r8-wccr-v5f2](https://github.com/advisories/GHSA-h8r8-wccr-v5f2) <3.3.2 |
| dompurify | [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) <=3.4.12 |
| dompurify | [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) <=3.4.11 |
| dompurify | [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) <=3.4.15 |
| dompurify | [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr) <=3.4.16 |
| dompurify | [GHSA-c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f) <=3.4.16 |
| jspdf | [GHSA-f8cm-6447-x5h2](https://github.com/advisories/GHSA-f8cm-6447-x5h2) <=3.0.4 |
| jspdf | [GHSA-pqxr-3g65-p328](https://github.com/advisories/GHSA-pqxr-3g65-p328) <=4.0.0 |
| jspdf | [GHSA-95fx-jjr5-f39c](https://github.com/advisories/GHSA-95fx-jjr5-f39c) <=4.0.0 |
| jspdf | [GHSA-vm32-vv63-w422](https://github.com/advisories/GHSA-vm32-vv63-w422) <=4.0.0 |
| jspdf | [GHSA-cjw8-79x6-5cj4](https://github.com/advisories/GHSA-cjw8-79x6-5cj4) <=4.0.0 |
| jspdf | [GHSA-9vjf-qc39-jprp](https://github.com/advisories/GHSA-9vjf-qc39-jprp) <4.2.0 |
| jspdf | [GHSA-67pg-wm7f-q7fj](https://github.com/advisories/GHSA-67pg-wm7f-q7fj) <4.2.0 |
| jspdf | [GHSA-p5xg-68wr-hm3m](https://github.com/advisories/GHSA-p5xg-68wr-hm3m) <4.2.0 |
| jspdf | [GHSA-7x6v-j9x4-qf24](https://github.com/advisories/GHSA-7x6v-j9x4-qf24) <=4.2.0 |
| jspdf | [GHSA-wfv2-pwc8-crg5](https://github.com/advisories/GHSA-wfv2-pwc8-crg5) <=4.2.0 |
| jspdf-autotable | Through `jspdf` |

## Next.js and PostCSS

Next 15.5.29 pins nested PostCSS 8.4.31. The listed PostCSS source-map findings require processing attacker-controlled CSS with source-map loading, and the style-context issue involves embedding stringified untrusted CSS into HTML. Static review found repository-controlled CSS and print styles, with no app route that accepts arbitrary CSS or user-provided source maps. That reduces apparent application-level reachability. It does not protect build tooling from malicious inputs or a compromised dependency. The app-specific assessment is static. No exploit was executed.

Upstream PostCSS 8.5.23 patches the latest listed source-map advisory. npm proposed Next 16.4.6 as a major-version remediation for this dependency chain. This branch retains Next 15.5.29 and does not override its bundled PostCSS. Evaluate a patched framework lock or a narrowly tested override before production. The direct Mongoose and Zod findings, the other production findings, and the critical development tar finding remain open. Review compatible lock updates individually. No forced npm audit fix was used.
