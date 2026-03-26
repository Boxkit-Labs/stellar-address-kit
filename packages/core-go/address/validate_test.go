package address

import "testing"

func TestValidate(t *testing.T) {
	const gAddr = "GAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQADRSI"
	const mAddr = "MAYCUYT553C5LHVE2XPW5GMEJT4BXGM7AHMJWLAPZP53KJO7EIQACAAAAAAAAAAAAD672"

	tests := []struct {
		name    string
		addr    string
		kinds   []AddressKind
		want    bool
	}{
		{
			name: "invalid address",
			addr: "INVALID",
			want: false,
		},
		{
			name: "valid G, no kind filter",
			addr: gAddr,
			want: true,
		},
		{
			name:  "valid G, matching kind filter",
			addr:  gAddr,
			kinds: []AddressKind{KindG},
			want:  true,
		},
		{
			name:  "valid G, non-matching kind filter",
			addr:  gAddr,
			kinds: []AddressKind{KindM},
			want:  false,
		},
		{
			name:  "valid G, multiple kinds including match",
			addr:  gAddr,
			kinds: []AddressKind{KindM, KindG},
			want:  true,
		},
		{
			name:  "valid M, mismatched kind filter",
			addr:  mAddr,
			kinds: []AddressKind{KindG},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Validate(tt.addr, tt.kinds...)
			if got != tt.want {
				t.Errorf("Validate() = %v, want %v", got, tt.want)
			}
		})
	}
}

