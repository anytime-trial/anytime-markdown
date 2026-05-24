from pkg.models import Dog


class Puppy(Dog):
    def fetch(self) -> bool:
        return True
