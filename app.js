/* ============================================================
   SynCargo — Fake Door 랜딩페이지 로직
   - track() 래퍼 (PostHog 권장, 미설정 시 console + localStorage 큐)
   - 스크롤 깊이 / CTA / 폼 이벤트 (CLAUDE.md §5)
   - 폼 검증 + 제출 플로우 (§4)
   ============================================================ */

/* ---------- 분리 상수 (CLAUDE.md §8) ---------- */
var FORM_ENDPOINT = "https://formspree.io/f/mjgdelob";  // Formspree (미설정 시 localStorage + mailto 폴백)
var ANALYTICS_KEY = "phc_z6hYGtYuUKgDwQWYHaKgLoyHTMooHcgyGkC8Yu3UjFKS";  // PostHog project key (미설정 시 console.log + localStorage 큐)
var ANALYTICS_HOST = "https://us.i.posthog.com";  // PostHog 리전 host (US Cloud)
var CONTACT_EMAIL = "soyunbag066@gmail.com";

(function () {
  "use strict";

  /* ============================================================
     1. Analytics — track() 래퍼
     ============================================================ */
  var posthogReady = false;

  function initAnalytics() {
    if (!ANALYTICS_KEY) return; // 키 없으면 로컬 모드로만 동작
    // PostHog 스니펫 (공식 최소형)
    !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } } (p = t.createElement("script")).type = "text/javascript", p.async = !0, p.src = s.api_host + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e }, u.people.toString = function () { return u.toString(1) + ".people (stub)" }, o = "capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "), n = 0; n < o.length; n++)g(u, o[n]); e._i.push([i, s, a]) }, e.__SV = 1) }(document, window.posthog || []);
    window.posthog.init(ANALYTICS_KEY, {
      api_host: ANALYTICS_HOST,
      capture_pageview: false,  // page_view는 track()에서 직접 발화 (referrer/utm 속성 포함)
      persistence: "localStorage+cookie"
    });
    posthogReady = true;
  }

  function track(eventName, props) {
    props = props || {};
    // 공통 컨텍스트
    props.path = location.pathname;
    if (posthogReady && window.posthog) {
      try { window.posthog.capture(eventName, props); } catch (e) { /* noop */ }
    }
    // 항상 로컬 큐에 백업 (키 미설정 환경에서도 분석 가능)
    try {
      var q = JSON.parse(localStorage.getItem("sc_events") || "[]");
      q.push({ event: eventName, props: props, ts: Date.now() });
      localStorage.setItem("sc_events", JSON.stringify(q.slice(-500)));
    } catch (e) { /* storage 불가 환경 */ }
    if (!ANALYTICS_KEY) console.log("[track]", eventName, props);
  }

  /* utm / referrer 수집 */
  function getUtm() {
    var p = new URLSearchParams(location.search), out = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
      if (p.get(k)) out[k] = p.get(k);
    });
    return out;
  }

  /* ============================================================
     2. 페이지뷰 + 스크롤 깊이
     ============================================================ */
  function bindPageView() {
    var utm = getUtm();
    track("page_view", Object.assign({ referrer: document.referrer || "(direct)" }, utm));
  }

  function bindScrollDepth() {
    var marks = [25, 50, 75, 100], fired = {};
    function onScroll() {
      var doc = document.documentElement;
      var scrolled = doc.scrollTop + window.innerHeight;
      var total = doc.scrollHeight;
      var pct = Math.round((scrolled / total) * 100);
      marks.forEach(function (m) {
        if (pct >= m && !fired[m]) { fired[m] = true; track("scroll_depth", { depth: m }); }
      });
    }
    window.addEventListener("scroll", throttle(onScroll, 400), { passive: true });
  }

  function throttle(fn, wait) {
    var last = 0, timer;
    return function () {
      var now = Date.now(), ctx = this, args = arguments;
      var remaining = wait - (now - last);
      if (remaining <= 0) { clearTimeout(timer); last = now; fn.apply(ctx, args); }
      else { clearTimeout(timer); timer = setTimeout(function () { last = Date.now(); fn.apply(ctx, args); }, remaining); }
    };
  }

  /* ============================================================
     3. CTA 클릭 — data-track 속성 기반 위임
     ============================================================ */
  function bindCtaClicks() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-track]");
      if (!el) return;
      var name = el.getAttribute("data-track");
      var props = {};
      if (name === "cta_hero_diagnosis_click") props.position = "hero";
      track(name, props);

      // 가격 안내 버튼 = fake door 리빌 (가장 강한 구매 신호)
      if (name === "cta_pricing_click") {
        var note = document.getElementById("pricingNote");
        if (note) note.hidden = false;
      }
    });
  }

  /* ============================================================
     4. 개인정보 모달
     ============================================================ */
  function bindModal() {
    var modal = document.getElementById("privacyModal");
    function open() { modal.hidden = false; document.body.style.overflow = "hidden"; }
    function close() { modal.hidden = true; document.body.style.overflow = ""; }

    ["openPrivacy", "openPrivacyFooter"].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", open);
    });
    modal.querySelectorAll("[data-close-modal]").forEach(function (el) {
      el.addEventListener("click", close);
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) close(); });
  }

  /* ============================================================
     5. 폼 — 검증 + 제출 플로우
     ============================================================ */
  function bindForm() {
    var form = document.getElementById("signupForm");
    if (!form) return;
    var errorBox = document.getElementById("formError");
    var doneBox = document.getElementById("signupDone");
    var submitBtn = document.getElementById("submitBtn");
    var startedFired = false;
    var lastField = "";

    // form_start (첫 필드 포커스)
    form.addEventListener("focusin", function (e) {
      lastField = e.target.name || e.target.id || lastField;
      if (!startedFired) { startedFired = true; track("form_start", {}); }
    });

    // form_abandon (시작 후 미제출 이탈)
    var submitted = false;
    window.addEventListener("beforeunload", function () {
      if (startedFired && !submitted) track("form_abandon", { last_field: lastField });
    });

    function clearInvalid() {
      form.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });
    }
    function markInvalid(field, msg) {
      var wrap = field.closest(".field");
      if (wrap) wrap.classList.add("invalid");
      errors.push(msg);
    }
    var errors = [];

    function validate() {
      errors = [];
      clearInvalid();

      // 필수 텍스트/셀렉트 (회사명은 선택 항목)
      ["name", "role", "email", "company_size", "shipments", "mail_tool"].forEach(function (id) {
        var el = form.elements[id];
        if (!el.value.trim()) markInvalid(el, "필수 항목을 입력해 주세요.");
      });

      // 이메일 형식
      var email = form.elements.email;
      if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        markInvalid(email, "이메일 형식을 확인해 주세요.");
      }

      // 체크박스 그룹 1개 이상
      if (!form.querySelector('input[name="risks"]:checked')) errors.push("가장 자주 발생하는 리스크를 1개 이상 선택해 주세요.");
      if (!form.querySelector('input[name="context_channels"]:checked')) errors.push("업무 맥락이 남는 곳을 1개 이상 선택해 주세요.");

      // 인터뷰 의향 라디오
      if (!form.querySelector('input[name="interview_ok"]:checked')) errors.push("인터뷰 참여 의향을 선택해 주세요.");

      // 동의 체크
      if (!form.elements.consent.checked) {
        markInvalid(form.elements.consent, "개인정보 수집·이용 동의가 필요합니다.");
      }

      return errors.length === 0;
    }

    function collect() {
      var fd = new FormData(form);
      var data = {
        company: fd.get("company"),
        name: fd.get("name"),
        role: fd.get("role"),
        email: fd.get("email"),
        phone: fd.get("phone") || "",
        company_size: fd.get("company_size"),
        shipments: fd.get("shipments"),
        mail_tool: fd.get("mail_tool"),
        risks: fd.getAll("risks"),
        context_channels: fd.getAll("context_channels"),
        churn_experience: fd.get("churn_experience") || "",
        interview_ok: fd.get("interview_ok"),
        consent: form.elements.consent.checked,
        submitted_at: new Date().toISOString()
      };
      return data;
    }

    function saveLocal(data) {
      try {
        var arr = JSON.parse(localStorage.getItem("sc_submissions") || "[]");
        arr.push(data);
        localStorage.setItem("sc_submissions", JSON.stringify(arr));
      } catch (e) { /* noop */ }
    }

    function mailtoFallback(data) {
      var subj = encodeURIComponent("[SynCargo 베타 신청] " + data.company);
      var body = encodeURIComponent(
        "회사명: " + data.company + "\n이름: " + data.name + " (" + data.role + ")\n" +
        "이메일: " + data.email + "\n연락처: " + data.phone + "\n직원 수: " + data.company_size + "\n" +
        "월평균 선적: " + data.shipments + "\n메일 도구: " + data.mail_tool + "\n" +
        "리스크: " + data.risks.join(", ") + "\n맥락 채널: " + data.context_channels.join(", ") + "\n" +
        "퇴사·이탈 경험: " + data.churn_experience + "\n인터뷰 의향: " + data.interview_ok
      );
      return "mailto:" + CONTACT_EMAIL + "?subject=" + subj + "&body=" + body;
    }

    function showDone() {
      form.hidden = true;
      doneBox.hidden = false;
      doneBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorBox.hidden = true;

      if (!validate()) {
        errorBox.textContent = errors[0];
        errorBox.hidden = false;
        var firstInvalid = form.querySelector(".invalid input, .invalid select, .invalid");
        if (firstInvalid && firstInvalid.scrollIntoView) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      var data = collect();
      saveLocal(data); // 항상 로컬 백업 먼저

      // 주의: 회사명·이메일·연락처 등 개인정보(PII)는 PostHog로 보내지 않습니다.
      // 연락처 명단은 Formspree에만 저장(개인정보 최소 수집). 분포 분석용 비식별 값만 전송.
      track("form_submit", {
        role: data.role,
        company_size: data.company_size,
        shipments: data.shipments,
        mail_tool: data.mail_tool,
        risks: data.risks,
        context_channels: data.context_channels,
        churn_experience: data.churn_experience,
        interview_ok: data.interview_ok
      });
      submitted = true;

      submitBtn.disabled = true;
      submitBtn.textContent = "전송 중…";

      function done() { submitBtn.disabled = false; submitBtn.textContent = "신청하고 무료 진단 받기"; showDone(); }

      if (FORM_ENDPOINT) {
        fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(data)
        }).then(function (res) {
          if (!res.ok) throw new Error("bad status");
          done();
        }).catch(function () {
          // 전송 실패 → 로컬엔 이미 저장됨 + mailto 폴백 안내
          submitBtn.disabled = false;
          submitBtn.textContent = "신청하고 무료 진단 받기";
          errorBox.innerHTML = '전송이 일시적으로 실패했습니다. 신청 내용은 안전하게 저장되었습니다. ' +
            '<a href="' + mailtoFallback(data) + '">이메일로 직접 신청하기</a>';
          errorBox.hidden = false;
        });
      } else {
        // 엔드포인트 미설정 → 로컬 저장 완료로 간주하고 완료 화면 표시
        done();
      }
    });
  }

  /* ============================================================
     6. 스크롤 진입 애니메이션 (reveal)
     ============================================================ */
  function bindReveal() {
    var targets = document.querySelectorAll(
      ".section-head, .card, .step, .roi-card, .ba-table, .feature-mockups > *, .faq-item, .toolband, .problem-closer, .roi-aside"
    );
    if (!("IntersectionObserver" in window) || !targets.length) return;

    // 스태거 효과를 위해 그리드 형제 간 약간의 지연
    targets.forEach(function (el) { el.classList.add("reveal"); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var sibs = el.parentNode ? el.parentNode.children : [];
          var idx = Array.prototype.indexOf.call(sibs, el);
          el.style.transitionDelay = (Math.max(0, idx) * 70) + "ms";
          el.classList.add("is-in");
          io.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     7. 네비 활성 표시 (scroll spy)
     ============================================================ */
  function bindScrollSpy() {
    var nav = document.getElementById("primaryNav");
    if (!nav || !("IntersectionObserver" in window)) return;
    var links = {};
    nav.querySelectorAll('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      if (id) links[id] = a;
    });
    var sections = Object.keys(links)
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = links[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove("active"); });
          link.classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ============================================================
     8. 모바일 하단 고정 CTA (히어로 통과 후 표시, 폼 보일 때 숨김)
     ============================================================ */
  function bindMobileCta() {
    var bar = document.getElementById("mobileCta");
    var hero = document.getElementById("hero");
    var signup = document.getElementById("signup");
    if (!bar || !hero) return;

    var pastHero = false, atSignup = false;
    function update() { bar.classList.toggle("show", pastHero && !atSignup); }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        pastHero = !e[0].isIntersecting; update();
      }, { threshold: 0 }).observe(hero);

      if (signup) {
        new IntersectionObserver(function (e) {
          atSignup = e[0].isIntersecting; update();
        }, { threshold: 0 }).observe(signup);
      }
    }
  }

  /* ============================================================
     init
     ============================================================ */
  function init() {
    // 연락 이메일 placeholder 동기화
    var c = document.getElementById("contactLink");
    if (c) { c.href = "mailto:" + CONTACT_EMAIL; c.textContent = CONTACT_EMAIL; }

    initAnalytics();
    bindPageView();
    bindScrollDepth();
    bindCtaClicks();
    bindModal();
    bindForm();
    bindReveal();
    bindScrollSpy();
    bindMobileCta();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
