package com.micwalk.timelineclock;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TC Preview: what the user typed in the "which preview?" box, as a site address. Plain Java
 * (no Android classes) so it is unit tested (SiteAddressTest).
 *
 * Only the live site and its Netlify deploys are accepted ("deploy-preview-6--" + live host,
 * or any other "name--" + live host), so the app never loads someone else's site.
 */
final class SiteAddress {

    private static final Pattern PR_NUMBER = Pattern.compile("^(?:pr\\s*)?#?\\s*(\\d{1,6})$", Pattern.CASE_INSENSITIVE);
    private static final Pattern NETLIFY_PREFIX = Pattern.compile("^[a-z0-9]+(?:-[a-z0-9]+)*$");

    private SiteAddress() {}

    /**
     * The address for `input` ("6", "PR 6", "#6", or an address on the live site or one of its
     * Netlify deploys), as "https://host"; null if it isn't one.
     */
    static String parse(String input, String liveUrl) {
        String liveHost = host(liveUrl);
        if (input == null || liveHost == null) return null;
        String text = input.trim();
        if (text.isEmpty()) return null;

        Matcher pr = PR_NUMBER.matcher(text);
        if (pr.matches()) {
            long n = Long.parseLong(pr.group(1));
            return n > 0 ? "https://deploy-preview-" + n + "--" + liveHost : null;
        }

        String withScheme = text.contains("://") ? text : "https://" + text;
        String host;
        try {
            URI uri = new URI(withScheme);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return null;
            host = uri.getHost();
        } catch (URISyntaxException e) {
            return null;
        }
        if (host == null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (host.equals(liveHost)) return "https://" + host;
        String suffix = "--" + liveHost;
        if (!host.endsWith(suffix)) return null;
        String prefix = host.substring(0, host.length() - suffix.length());
        return NETLIFY_PREFIX.matcher(prefix).matches() ? "https://" + host : null;
    }

    /** What to call an address in the chooser: "PR 6", "the live site", or the host. */
    static String describe(String url, String liveUrl) {
        String h = host(url);
        String liveHost = host(liveUrl);
        if (h == null) return "";
        if (h.equals(liveHost)) return "the live site";
        Matcher m = Pattern.compile("^deploy-preview-(\\d+)--").matcher(h);
        return m.find() ? "PR " + m.group(1) : h;
    }

    /** What to prefill the box with for an address: the PR number for a deploy preview, else the address. */
    static String editable(String url, String liveUrl) {
        String d = describe(url, liveUrl);
        return d.startsWith("PR ") ? d.substring(3) : url == null ? "" : url;
    }

    private static String host(String url) {
        if (url == null) return null;
        try {
            String h = new URI(url).getHost();
            return h == null ? null : h.toLowerCase(Locale.ROOT);
        } catch (URISyntaxException e) {
            return null;
        }
    }
}
