(() => {
  const SUBJECT = "Oui Smoke event booking request";

  const BODY = `Hi Oui Smoke,

I'd like to book hookah catering for an event. Here are the details:

CONTACT
Full name:
Phone:
Email:
Company / host name (if applicable):

EVENT
Event type (private / corporate / other):
Event date:
Start time:
Desired service length (hours):
Venue name:
Full address / city:
Inside GTA? (yes / no):
Indoor or outdoor:

GUESTS & SETUP
Estimated guest count:
Number of hookahs needed:
Flavour preferences / custom blends:
Theme or branding needs:

ADD-ONS (check any that apply)
[ ] Extra hours
[ ] LED bases
[ ] Water enhancers
[ ] Unit branding
[ ] Custom flavour blends
[ ] Bartenders / DJs / photographers / other:

NOTES
Anything else we should know:


Thank you!`;

  const href = `mailto:contact@ouismoke.co?subject=${encodeURIComponent(
    SUBJECT
  )}&body=${encodeURIComponent(BODY)}`;

  document.querySelectorAll("[data-book-event]").forEach((link) => {
    link.setAttribute("href", href);
  });
})();
