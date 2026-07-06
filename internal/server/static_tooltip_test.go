package server

import (
	"strings"
	"testing"
)

func readStaticAsset(t *testing.T, name string) string {
	t.Helper()
	b, err := staticFS.ReadFile("static/" + name)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", name, err)
	}
	return string(b)
}

func requireStaticContains(t *testing.T, asset, content, want string) {
	t.Helper()
	if !strings.Contains(content, want) {
		t.Fatalf("%s is missing expected front-end tooltip contract:\n%s", asset, want)
	}
}

func TestStaticTooltipCoreContract(t *testing.T) {
	core := readStaticAsset(t, "js/core.js")

	for _, want := range []string{
		"const tooltipSelector = '[data-tooltip], [data-tooltip-on-overflow]'",
		"tooltipEl.className = 'app-tooltip'",
		"tooltipEl.setAttribute('role', 'tooltip')",
		"if (target.hasAttribute('data-tooltip-on-overflow') && !isTooltipOverflowing(target)) return ''",
		"root.addEventListener('mouseover'",
		"root.addEventListener('mousemove'",
		"root.addEventListener('mouseout'",
		"root.addEventListener('focusin'",
		"root.addEventListener('focusout'",
		"document.addEventListener('DOMContentLoaded', () => bindDataTooltipHost(document.body))",
		"window.addEventListener('scroll', hideTooltip, true)",
		"window.addEventListener('resize', hideTooltip, true)",
	} {
		requireStaticContains(t, "js/core.js", core, want)
	}
}

func TestPricingUsesEscapedOverflowTooltipAttributes(t *testing.T) {
	pricing := readStaticAsset(t, "js/pricing.js")

	for _, want := range []string{
		"function overflowTooltipAttr(value)",
		"return text ? ` data-tooltip-on-overflow=\"${esc(text)}\"` : '';",
		"<div class=\"pricing-status-value ${cls || ''}\"${overflowTooltipAttr(value)}>",
		"<div class=\"pricing-model-name\"${overflowTooltipAttr(item.model)}>",
		"<span class=\"alias-note-value\"${overflowTooltipAttr(item.note || '-')}>",
		"<span class=\"alias-candidate-chip\"${overflowTooltipAttr(item.canonical_model)}>",
	} {
		requireStaticContains(t, "js/pricing.js", pricing, want)
	}

	if got := strings.Count(pricing, "overflowTooltipAttr("); got < 10 {
		t.Fatalf("js/pricing.js should apply overflow tooltip coverage broadly, got %d uses", got)
	}
}

func TestStaticTooltipStyleContract(t *testing.T) {
	styles := readStaticAsset(t, "styles.css")

	for _, want := range []string{
		".app-tooltip {",
		"position: fixed; z-index: 9999;",
		"box-sizing: border-box; overflow-wrap: anywhere;",
		"pointer-events: none; opacity: 0; transform: translateY(-3px);",
		".app-tooltip::after {",
		"left: var(--tooltip-arrow-left, 18px);",
		".app-tooltip:not([hidden]) { opacity: 1; transform: translateY(0); }",
	} {
		requireStaticContains(t, "styles.css", styles, want)
	}
}

