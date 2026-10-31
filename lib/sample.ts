import type { ContextInput } from "./types";

export const SAMPLE_CLIENT = "Northline Hotels";

export const SAMPLE_PERIOD = "October compared with September";

export const SAMPLE_CSV = `channel,metric,last_month,this_month
Edinburgh - Generic,Spend,6200,4900
Edinburgh - Generic,Bookings,148,141
Edinburgh - Generic,ROAS,3.1,3.9
Edinburgh - Generic,CPA,41.9,34.8
Edinburgh - Brand,Spend,1800,1950
Edinburgh - Brand,Bookings,96,124
Edinburgh - Brand,ROAS,7.2,8.1
Edinburgh - Brand,CPA,18.8,15.7
Manchester - Generic,Spend,5100,6400
Manchester - Generic,Bookings,109,131
Manchester - Generic,ROAS,2.6,2.5
Manchester - Generic,CPA,46.8,48.9
Manchester - Brand,Spend,1500,1100
Manchester - Brand,Bookings,82,63
Manchester - Brand,ROAS,6.8,6.9
Manchester - Brand,CPA,18.3,17.5
`;

export const SAMPLE_CONTEXT: ContextInput = {
  campaign: `Edinburgh - Generic: Paused the broad-match ad group on 8 Oct because it had the lowest return in the account
Manchester - Generic: Launched a new responsive search ad (RSA) on 10 Oct
Manchester: Moved weekly budget from Brand to Generic on 14 Oct`,
  seasonality: `Edinburgh: School half-term and Halloween weekend lifted city-break searches in the last week of October`,
  site: `Edinburgh: New Winter Breaks landing page went live on 3 Oct
Manchester: Booking engine threw checkout errors on 20-22 Oct and was fixed on 22 Oct`,
  goals: `Edinburgh - Generic: Hold ROAS above 3.5
all: Client priority this quarter is Manchester bookings`,
};
