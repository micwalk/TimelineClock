package com.micwalk.timelineclock;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class SiteAddressTest {

    private static final String LIVE = "https://timelineclockapp.netlify.app";
    private static final String PR6 = "https://deploy-preview-6--timelineclockapp.netlify.app";

    @Test
    public void prNumberMeansItsDeployPreview() {
        assertEquals(PR6, SiteAddress.parse("6", LIVE));
        assertEquals(PR6, SiteAddress.parse(" 6 ", LIVE));
        assertEquals(PR6, SiteAddress.parse("#6", LIVE));
        assertEquals(PR6, SiteAddress.parse("PR 6", LIVE));
        assertEquals(PR6, SiteAddress.parse("pr6", LIVE));
        assertEquals("https://deploy-preview-123--timelineclockapp.netlify.app", SiteAddress.parse("123", LIVE));
        assertNull(SiteAddress.parse("0", LIVE));
    }

    @Test
    public void acceptsAddressesOnTheSiteAndItsNetlifyDeploys() {
        assertEquals(PR6, SiteAddress.parse(PR6, LIVE));
        assertEquals(PR6, SiteAddress.parse(PR6 + "/some/path?x=1", LIVE));
        assertEquals(PR6, SiteAddress.parse("deploy-preview-6--timelineclockapp.netlify.app", LIVE));
        assertEquals(PR6, SiteAddress.parse("HTTPS://Deploy-Preview-6--TimelineClockApp.netlify.app/", LIVE));
        assertEquals(LIVE, SiteAddress.parse(LIVE + "/", LIVE));
        assertEquals("https://my-branch--timelineclockapp.netlify.app", SiteAddress.parse("https://my-branch--timelineclockapp.netlify.app", LIVE));
    }

    @Test
    public void refusesOtherSitesAndJunk() {
        assertNull(SiteAddress.parse("", LIVE));
        assertNull(SiteAddress.parse("   ", LIVE));
        assertNull(SiteAddress.parse(null, LIVE));
        assertNull(SiteAddress.parse("http://deploy-preview-6--timelineclockapp.netlify.app", LIVE));
        assertNull(SiteAddress.parse("https://example.com", LIVE));
        assertNull(SiteAddress.parse("https://timelineclockapp.netlify.app.evil.com", LIVE));
        assertNull(SiteAddress.parse("https://evil.com/--timelineclockapp.netlify.app", LIVE));
        assertNull(SiteAddress.parse("https://a.b--timelineclockapp.netlify.app", LIVE));
        assertNull(SiteAddress.parse("https://--timelineclockapp.netlify.app", LIVE));
        assertNull(SiteAddress.parse("six", LIVE));
        assertNull(SiteAddress.parse("6", null));
    }

    @Test
    public void describesAddressesForTheChooser() {
        assertEquals("PR 6", SiteAddress.describe(PR6, LIVE));
        assertEquals("the live site", SiteAddress.describe(LIVE, LIVE));
        assertEquals("my-branch--timelineclockapp.netlify.app", SiteAddress.describe("https://my-branch--timelineclockapp.netlify.app", LIVE));
        assertEquals("6", SiteAddress.editable(PR6, LIVE));
        assertEquals(LIVE, SiteAddress.editable(LIVE, LIVE));
        assertEquals("", SiteAddress.editable(null, LIVE));
    }
}
